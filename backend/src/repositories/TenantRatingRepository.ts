import { randomUUID, randomBytes } from 'node:crypto'
import { getPool } from '../db.js'

export interface TenantRating {
  id: string
  tenantId: string
  landlordId: string
  dealId: string
  paymentTimeliness: number
  propertyCare: number
  communication: number
  overall: number
  comment?: string
  createdAt: Date
}

export interface RatingAggregate {
  tenantId: string
  overallAvg: number
  paymentTimelinessAvg: number
  propertyCareAvg: number
  communicationAvg: number
  totalRatings: number
}

export interface RatingCardToken {
  id: string
  tenantId: string
  token: string
  expiresAt: Date
  createdAt: Date
}

interface RatingRow {
  id: string
  tenant_id: string
  landlord_id: string
  deal_id: string
  payment_timeliness: number
  property_care: number
  communication: number
  overall: number
  comment: string | null
  created_at: Date
}

interface TokenRow {
  id: string
  tenant_id: string
  token: string
  expires_at: Date
  created_at: Date
}

export class TenantRatingRepository {
  private async pool() {
    const pool = await getPool()
    if (!pool) throw new Error('Database pool is not available')
    return pool
  }

  async create(rating: {
    tenantId: string
    landlordId: string
    dealId: string
    paymentTimeliness: number
    propertyCare: number
    communication: number
    overall: number
    comment?: string
  }): Promise<TenantRating> {
    const pool = await this.pool()
    const { rows } = await pool.query(
      `INSERT INTO tenant_ratings
       (tenant_id, landlord_id, deal_id, payment_timeliness, property_care, communication, overall, comment)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        rating.tenantId,
        rating.landlordId,
        rating.dealId,
        rating.paymentTimeliness,
        rating.propertyCare,
        rating.communication,
        rating.overall,
        rating.comment ?? null,
      ],
    )
    return this.mapRatingRow(rows[0] as RatingRow)
  }

  async findByTenantId(tenantId: string): Promise<TenantRating[]> {
    const pool = await this.pool()
    const { rows } = await pool.query(
      `SELECT * FROM tenant_ratings WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenantId],
    )
    return rows.map((r: RatingRow) => this.mapRatingRow(r))
  }

  async getAggregate(tenantId: string): Promise<RatingAggregate | null> {
    const pool = await this.pool()
    const { rows } = await pool.query(
      `SELECT
         COUNT(*)::int AS total_ratings,
         ROUND(AVG(payment_timeliness)::numeric, 2)::float8 AS payment_timeliness_avg,
         ROUND(AVG(property_care)::numeric, 2)::float8 AS property_care_avg,
         ROUND(AVG(communication)::numeric, 2)::float8 AS communication_avg,
         ROUND(AVG(overall)::numeric, 2)::float8 AS overall_avg
       FROM tenant_ratings
       WHERE tenant_id = $1`,
      [tenantId],
    )
    const row = rows[0] as {
      total_ratings: number
      payment_timeliness_avg: number
      property_care_avg: number
      communication_avg: number
      overall_avg: number
    } | undefined

    if (!row || row.total_ratings === 0) return null

    return {
      tenantId,
      overallAvg: row.overall_avg,
      paymentTimelinessAvg: row.payment_timeliness_avg,
      propertyCareAvg: row.property_care_avg,
      communicationAvg: row.communication_avg,
      totalRatings: row.total_ratings,
    }
  }

  async hasRatedDeal(landlordId: string, dealId: string): Promise<boolean> {
    const pool = await this.pool()
    const { rows } = await pool.query(
      `SELECT 1 FROM tenant_ratings WHERE landlord_id = $1 AND deal_id = $2 LIMIT 1`,
      [landlordId, dealId],
    )
    return rows.length > 0
  }

  async createShareToken(tenantId: string, ttlHours: number = 72): Promise<RatingCardToken> {
    const pool = await this.pool()
    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000)
    const { rows } = await pool.query(
      `INSERT INTO rating_card_tokens (tenant_id, token, expires_at)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [tenantId, token, expiresAt],
    )
    return this.mapTokenRow(rows[0] as TokenRow)
  }

  async getTokenData(token: string): Promise<{ tenantId: string; expiresAt: Date } | null> {
    const pool = await this.pool()
    const { rows } = await pool.query(
      `SELECT tenant_id, expires_at FROM rating_card_tokens WHERE token = $1`,
      [token],
    )
    if (rows.length === 0) return null
    const row = rows[0] as { tenant_id: string; expires_at: Date }
    return { tenantId: row.tenant_id, expiresAt: new Date(row.expires_at) }
  }

  private mapRatingRow(row: RatingRow): TenantRating {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      landlordId: row.landlord_id,
      dealId: row.deal_id,
      paymentTimeliness: row.payment_timeliness,
      propertyCare: row.property_care,
      communication: row.communication,
      overall: row.overall,
      comment: row.comment ?? undefined,
      createdAt: new Date(row.created_at),
    }
  }

  private mapTokenRow(row: TokenRow): RatingCardToken {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      token: row.token,
      expiresAt: new Date(row.expires_at),
      createdAt: new Date(row.created_at),
    }
  }
}

export const tenantRatingRepository = new TenantRatingRepository()
