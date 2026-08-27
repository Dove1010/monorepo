/**
 * Tenant Rating Card store following the Hybrid pattern
 */

import { randomUUID } from 'node:crypto'
import { getPool, type PgPoolLike } from '../db.js'
import {
  TenantRating,
  TenantRatingCard,
  CreateRatingInput,
  ShareToken,
} from './tenantRatingCard.js'

interface TenantRatingCardStorePort {
  createRating(input: CreateRatingInput): Promise<TenantRating>
  getRatingsByTenant(tenantId: string): Promise<TenantRating[]>
  getRatingCard(tenantId: string): Promise<TenantRatingCard | null>
  hasLandlordRatedDeal(landlordId: string, dealId: string): Promise<boolean>
  createShareToken(tenantId: string): Promise<ShareToken>
  getShareToken(token: string): Promise<ShareToken | null>
  clear(): Promise<void>
}

const SHARE_TOKEN_TTL_MS = 48 * 60 * 60 * 1000 // 48 hours

function computeCompositeScore(ratings: TenantRating[]): {
  composite: number
  payment: number
  propertyCare: number
  communication: number
} {
  if (ratings.length === 0) {
    return { composite: 0, payment: 0, propertyCare: 0, communication: 0 }
  }

  const payment = ratings.reduce((sum, r) => sum + r.paymentScore, 0) / ratings.length
  const propertyCare = ratings.reduce((sum, r) => sum + r.propertyCareScore, 0) / ratings.length
  const communication = ratings.reduce((sum, r) => sum + r.communicationScore, 0) / ratings.length
  const composite = (payment + propertyCare + communication) / 3

  return {
    composite: Math.round(composite * 10) / 10,
    payment: Math.round(payment * 10) / 10,
    propertyCare: Math.round(propertyCare * 10) / 10,
    communication: Math.round(communication * 10) / 10,
  }
}

class InMemoryTenantRatingCardStore implements TenantRatingCardStorePort {
  private ratings = new Map<string, TenantRating[]>()
  private shareTokens = new Map<string, ShareToken>()

  async createRating(input: CreateRatingInput): Promise<TenantRating> {
    const rating: TenantRating = {
      ratingId: randomUUID(),
      landlordId: input.landlordId,
      tenantId: input.tenantId,
      dealId: input.dealId,
      paymentScore: input.paymentScore,
      propertyCareScore: input.propertyCareScore,
      communicationScore: input.communicationScore,
      comment: input.comment,
      createdAt: new Date(),
    }

    const tenantRatings = this.ratings.get(input.tenantId) || []
    tenantRatings.push(rating)
    this.ratings.set(input.tenantId, tenantRatings)

    return rating
  }

  async getRatingsByTenant(tenantId: string): Promise<TenantRating[]> {
    return this.ratings.get(tenantId) || []
  }

  async getRatingCard(tenantId: string): Promise<TenantRatingCard | null> {
    const ratings = this.ratings.get(tenantId)
    if (!ratings || ratings.length === 0) {
      return null
    }

    const scores = computeCompositeScore(ratings)

    return {
      tenantId,
      compositeScore: scores.composite,
      paymentScore: scores.payment,
      propertyCareScore: scores.propertyCare,
      communicationScore: scores.communication,
      totalRatings: ratings.length,
      ratings: [...ratings],
      updatedAt: new Date(),
    }
  }

  async hasLandlordRatedDeal(landlordId: string, dealId: string): Promise<boolean> {
    for (const ratings of this.ratings.values()) {
      if (ratings.some((r) => r.landlordId === landlordId && r.dealId === dealId)) {
        return true
      }
    }
    return false
  }

  async createShareToken(tenantId: string): Promise<ShareToken> {
    const token = randomUUID()
    const now = new Date()
    const shareToken: ShareToken = {
      token,
      tenantId,
      expiresAt: new Date(now.getTime() + SHARE_TOKEN_TTL_MS),
      createdAt: now,
    }

    this.shareTokens.set(token, shareToken)
    return shareToken
  }

  async getShareToken(token: string): Promise<ShareToken | null> {
    const shareToken = this.shareTokens.get(token)
    if (!shareToken) return null

    if (new Date() > shareToken.expiresAt) {
      this.shareTokens.delete(token)
      return null
    }

    return shareToken
  }

  async clear(): Promise<void> {
    this.ratings.clear()
    this.shareTokens.clear()
  }
}

type RatingRow = {
  rating_id: string
  landlord_id: string
  tenant_id: string
  deal_id: string
  payment_score: number
  property_care_score: number
  communication_score: number
  comment: string | null
  created_at: Date
}

type ShareTokenRow = {
  token: string
  tenant_id: string
  expires_at: Date
  created_at: Date
}

class PostgresTenantRatingCardStore implements TenantRatingCardStorePort {
  private async pool(): Promise<PgPoolLike> {
    const pool = await getPool()
    if (!pool) {
      throw new Error('Database pool is not available (DATABASE_URL/pg not configured)')
    }
    return pool
  }

  async isAvailable(): Promise<boolean> {
    return (await getPool()) !== null
  }

  async createRating(input: CreateRatingInput): Promise<TenantRating> {
    const pool = await this.pool()
    const ratingId = randomUUID()

    const { rows } = await pool.query(
      `INSERT INTO tenant_ratings (
        rating_id, landlord_id, tenant_id, deal_id,
        payment_score, property_care_score, communication_score, comment
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        ratingId,
        input.landlordId,
        input.tenantId,
        input.dealId,
        input.paymentScore,
        input.propertyCareScore,
        input.communicationScore,
        input.comment ?? null,
      ],
    )

    return this.mapRatingRow(rows[0] as RatingRow)
  }

  async getRatingsByTenant(tenantId: string): Promise<TenantRating[]> {
    const pool = await this.pool()
    const { rows } = await pool.query(
      'SELECT * FROM tenant_ratings WHERE tenant_id = $1 ORDER BY created_at DESC',
      [tenantId],
    )

    return rows.map((row) => this.mapRatingRow(row as RatingRow))
  }

  async getRatingCard(tenantId: string): Promise<TenantRatingCard | null> {
    const ratings = await this.getRatingsByTenant(tenantId)
    if (ratings.length === 0) return null

    const scores = computeCompositeScore(ratings)

    return {
      tenantId,
      compositeScore: scores.composite,
      paymentScore: scores.payment,
      propertyCareScore: scores.propertyCare,
      communicationScore: scores.communication,
      totalRatings: ratings.length,
      ratings,
      updatedAt: new Date(),
    }
  }

  async hasLandlordRatedDeal(landlordId: string, dealId: string): Promise<boolean> {
    const pool = await this.pool()
    const { rows } = await pool.query(
      'SELECT 1 FROM tenant_ratings WHERE landlord_id = $1 AND deal_id = $2 LIMIT 1',
      [landlordId, dealId],
    )
    return rows.length > 0
  }

  async createShareToken(tenantId: string): Promise<ShareToken> {
    const pool = await this.pool()
    const token = randomUUID()
    const now = new Date()
    const expiresAt = new Date(now.getTime() + SHARE_TOKEN_TTL_MS)

    await pool.query(
      `INSERT INTO tenant_rating_share_tokens (token, tenant_id, expires_at)
       VALUES ($1, $2, $3)`,
      [token, tenantId, expiresAt],
    )

    return { token, tenantId, expiresAt, createdAt: now }
  }

  async getShareToken(token: string): Promise<ShareToken | null> {
    const pool = await this.pool()
    const { rows } = await pool.query(
      `SELECT * FROM tenant_rating_share_tokens
       WHERE token = $1 AND expires_at > NOW()`,
      [token],
    )

    if (rows.length === 0) return null

    const row = rows[0] as ShareTokenRow
    return {
      token: row.token,
      tenantId: row.tenant_id,
      expiresAt: new Date(row.expires_at),
      createdAt: new Date(row.created_at),
    }
  }

  async clear(): Promise<void> {
    const pool = await this.pool()
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('tenantRatingCardStore.clear() is only supported in test env')
    }
    await pool.query('TRUNCATE tenant_ratings RESTART IDENTITY CASCADE')
    await pool.query('TRUNCATE tenant_rating_share_tokens RESTART IDENTITY CASCADE')
  }

  private mapRatingRow(row: RatingRow): TenantRating {
    return {
      ratingId: row.rating_id,
      landlordId: row.landlord_id,
      tenantId: row.tenant_id,
      dealId: row.deal_id,
      paymentScore: row.payment_score,
      propertyCareScore: row.property_care_score,
      communicationScore: row.communication_score,
      comment: row.comment ?? undefined,
      createdAt: new Date(row.created_at),
    }
  }
}

class HybridTenantRatingCardStore implements TenantRatingCardStorePort {
  private memory = new InMemoryTenantRatingCardStore()
  private postgres = new PostgresTenantRatingCardStore()

  private async adapter(): Promise<TenantRatingCardStorePort> {
    if (await this.postgres.isAvailable()) {
      return this.postgres
    }
    return this.memory
  }

  async createRating(input: CreateRatingInput): Promise<TenantRating> {
    return (await this.adapter()).createRating(input)
  }

  async getRatingsByTenant(tenantId: string): Promise<TenantRating[]> {
    return (await this.adapter()).getRatingsByTenant(tenantId)
  }

  async getRatingCard(tenantId: string): Promise<TenantRatingCard | null> {
    return (await this.adapter()).getRatingCard(tenantId)
  }

  async hasLandlordRatedDeal(landlordId: string, dealId: string): Promise<boolean> {
    return (await this.adapter()).hasLandlordRatedDeal(landlordId, dealId)
  }

  async createShareToken(tenantId: string): Promise<ShareToken> {
    return (await this.adapter()).createShareToken(tenantId)
  }

  async getShareToken(token: string): Promise<ShareToken | null> {
    return (await this.adapter()).getShareToken(token)
  }

  async clear(): Promise<void> {
    return (await this.adapter()).clear()
  }
}

export const tenantRatingCardStore = new HybridTenantRatingCardStore()
