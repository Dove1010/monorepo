import { randomUUID } from 'node:crypto'
import { getPool, type PgPoolLike } from '../db.js'
import {
  ApartmentReview,
  CreateApartmentReviewInput,
  ApartmentReviewFilters,
  PaginatedApartmentReviews,
} from './apartmentReview.js'

interface ApartmentReviewStorePort {
  create(input: CreateApartmentReviewInput): Promise<ApartmentReview>
  getById(id: string): Promise<ApartmentReview | null>
  list(filters?: ApartmentReviewFilters): Promise<PaginatedApartmentReviews>
  report(id: string): Promise<boolean>
  setHidden(id: string, isHidden: boolean): Promise<boolean>
  clear(): Promise<void>
}

class InMemoryApartmentReviewStore implements ApartmentReviewStorePort {
  private reviews = new Map<string, ApartmentReview>()

  async create(input: CreateApartmentReviewInput): Promise<ApartmentReview> {
    const now = new Date()
    const review: ApartmentReview = {
      id: randomUUID(),
      apartmentId: input.apartmentId,
      userId: input.userId,
      rating: input.rating,
      content: input.content,
      verifiedStay: input.verifiedStay ?? false,
      isHidden: false,
      isReported: false,
      createdAt: now,
      updatedAt: now,
    }

    this.reviews.set(review.id, review)
    return review
  }

  async getById(id: string): Promise<ApartmentReview | null> {
    return this.reviews.get(id) ?? null
  }

  async list(filters: ApartmentReviewFilters = {}): Promise<PaginatedApartmentReviews> {
    const { apartmentId, rating, verifiedStay, includeHidden = false, sortBy = 'newest', page = 1, pageSize = 20 } = filters
    let filtered = Array.from(this.reviews.values())

    if (apartmentId) {
      filtered = filtered.filter((r) => r.apartmentId === apartmentId)
    }
    if (rating) {
      filtered = filtered.filter((r) => r.rating === rating)
    }
    if (verifiedStay !== undefined) {
      filtered = filtered.filter((r) => r.verifiedStay === verifiedStay)
    }
    if (!includeHidden) {
      filtered = filtered.filter((r) => !r.isHidden)
    }

    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'oldest': return a.createdAt.getTime() - b.createdAt.getTime()
        case 'rating_desc': return b.rating - a.rating
        case 'rating_asc': return a.rating - b.rating
        case 'newest':
        default: return b.createdAt.getTime() - a.createdAt.getTime()
      }
    })

    const total = filtered.length
    const totalPages = Math.ceil(total / pageSize)
    const start = (page - 1) * pageSize
    const end = start + pageSize
    const reviews = filtered.slice(start, end)

    return {
      reviews,
      total,
      page,
      pageSize,
      totalPages,
    }
  }

  async report(id: string): Promise<boolean> {
    const review = this.reviews.get(id)
    if (!review) return false
    review.isReported = true
    review.updatedAt = new Date()
    return true
  }

  async setHidden(id: string, isHidden: boolean): Promise<boolean> {
    const review = this.reviews.get(id)
    if (!review) return false
    review.isHidden = isHidden
    review.updatedAt = new Date()
    return true
  }

  async clear(): Promise<void> {
    this.reviews.clear()
  }
}

type ReviewRow = {
  id: string
  apartment_id: string
  user_id: string
  user_name?: string
  rating: number
  content: string
  verified_stay: boolean
  is_hidden: boolean
  is_reported: boolean
  created_at: Date
  updated_at: Date
}

class PostgresApartmentReviewStore implements ApartmentReviewStorePort {
  private async pool(): Promise<PgPoolLike> {
    const pool = await getPool()
    if (!pool) {
      throw new Error('Database pool is not available')
    }
    return pool
  }

  async isAvailable(): Promise<boolean> {
    return (await getPool()) !== null
  }

  async create(input: CreateApartmentReviewInput): Promise<ApartmentReview> {
    const pool = await this.pool()
    const id = randomUUID()
    const { rows } = await pool.query(
      `INSERT INTO apartment_reviews (
        id, apartment_id, user_id, rating, content, verified_stay
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [
        id,
        input.apartmentId,
        input.userId,
        input.rating,
        input.content,
        input.verifiedStay ?? false,
      ],
    )

    return this.mapRow(rows[0] as ReviewRow)
  }

  async getById(id: string): Promise<ApartmentReview | null> {
    const pool = await this.pool()
    const { rows } = await pool.query(
      `SELECT r.*, u.name as user_name 
       FROM apartment_reviews r
       JOIN users u ON r.user_id = u.id AND u.deleted_at IS NULL
       WHERE r.id = $1`,
      [id],
    )

    if (rows.length === 0) return null
    return this.mapRow(rows[0] as ReviewRow)
  }

  async list(filters: ApartmentReviewFilters = {}): Promise<PaginatedApartmentReviews> {
    const pool = await this.pool()
    const where: string[] = []
    const values: unknown[] = []

    if (filters.apartmentId) {
      values.push(filters.apartmentId)
      where.push(`apartment_id = $${values.length}`)
    }

    if (filters.rating) {
      values.push(filters.rating)
      where.push(`rating = $${values.length}`)
    }

    if (filters.verifiedStay !== undefined) {
      values.push(filters.verifiedStay)
      where.push(`verified_stay = $${values.length}`)
    }

    if (!filters.includeHidden) {
      where.push(`is_hidden = false`)
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : ''
    
    let orderBy = 'created_at DESC'
    if (filters.sortBy) {
      switch (filters.sortBy) {
        case 'oldest': orderBy = 'created_at ASC'; break
        case 'rating_desc': orderBy = 'rating DESC, created_at DESC'; break
        case 'rating_asc': orderBy = 'rating ASC, created_at DESC'; break
        case 'newest':
        default: orderBy = 'created_at DESC'; break
      }
    }

    const page = filters.page && filters.page > 0 ? filters.page : 1
    const pageSize = filters.pageSize && filters.pageSize > 0 ? filters.pageSize : 20
    const offset = (page - 1) * pageSize

    const countResult = await pool.query(
      `SELECT COUNT(*) AS count FROM apartment_reviews ${whereClause}`,
      values,
    )

    const queryValues = [...values, pageSize, offset]
    const reviewRows = await pool.query(
      `SELECT r.*, u.name as user_name 
       FROM apartment_reviews r
       LEFT JOIN users u ON r.user_id = u.id AND u.deleted_at IS NULL
       ${whereClause}
       ORDER BY ${orderBy}
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      queryValues,
    )

    const total = Number((countResult.rows[0] as { count: string }).count)
    const reviews = reviewRows.rows.map((row) => this.mapRow(row as ReviewRow))

    return {
      reviews,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    }
  }

  async report(id: string): Promise<boolean> {
    const pool = await this.pool()
    const { rowCount } = await pool.query(
      'UPDATE apartment_reviews SET is_reported = true, updated_at = NOW() WHERE id = $1',
      [id],
    )
    return rowCount > 0
  }

  async setHidden(id: string, isHidden: boolean): Promise<boolean> {
    const pool = await this.pool()
    const { rowCount } = await pool.query(
      'UPDATE apartment_reviews SET is_hidden = $2, updated_at = NOW() WHERE id = $1',
      [id, isHidden],
    )
    return rowCount > 0
  }

  async clear(): Promise<void> {
    const pool = await this.pool()
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('apartmentReviewStore.clear() is only supported in test env')
    }
    await pool.query('TRUNCATE apartment_reviews RESTART IDENTITY CASCADE')
  }

  private mapRow(row: ReviewRow): ApartmentReview {
    return {
      id: row.id,
      apartmentId: row.apartment_id,
      userId: row.user_id,
      userName: row.user_name,
      rating: row.rating,
      content: row.content,
      verifiedStay: row.verified_stay,
      isHidden: row.is_hidden,
      isReported: row.is_reported,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }
  }
}

class HybridApartmentReviewStore implements ApartmentReviewStorePort {
  private memory = new InMemoryApartmentReviewStore()
  private postgres = new PostgresApartmentReviewStore()

  private async adapter(): Promise<ApartmentReviewStorePort> {
    if (await this.postgres.isAvailable()) {
      return this.postgres
    }
    return this.memory
  }

  async create(input: CreateApartmentReviewInput): Promise<ApartmentReview> {
    const adapter = await this.adapter()
    return adapter.create(input)
  }

  async getById(id: string): Promise<ApartmentReview | null> {
    const adapter = await this.adapter()
    return adapter.getById(id)
  }

  async list(filters: ApartmentReviewFilters = {}): Promise<PaginatedApartmentReviews> {
    const adapter = await this.adapter()
    return adapter.list(filters)
  }

  async report(id: string): Promise<boolean> {
    const adapter = await this.adapter()
    return adapter.report(id)
  }

  async setHidden(id: string, isHidden: boolean): Promise<boolean> {
    const adapter = await this.adapter()
    return adapter.setHidden(id, isHidden)
  }

  async clear(): Promise<void> {
    const adapter = await this.adapter()
    return adapter.clear()
  }
}

export const apartmentReviewStore = new HybridApartmentReviewStore()
