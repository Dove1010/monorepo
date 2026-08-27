import { randomUUID } from 'node:crypto'
import { getPool, type PgPoolLike } from '../db.js'
import {
  PropertyInspection,
  InspectionStatus,
  CreatePropertyInspectionInput,
  UpdatePropertyInspectionInput,
} from './propertyInspection.js'

interface PropertyInspectionStorePort {
  create(input: CreatePropertyInspectionInput): Promise<PropertyInspection>
  getById(id: string): Promise<PropertyInspection | null>
  getByListingId(listingId: string): Promise<PropertyInspection[]>
  getByInspectorId(inspectorId: string): Promise<PropertyInspection[]>
  update(id: string, input: UpdatePropertyInspectionInput): Promise<PropertyInspection | null>
  updateStatus(id: string, status: InspectionStatus): Promise<PropertyInspection | null>
  list(filters?: { status?: InspectionStatus; inspectorId?: string }): Promise<PropertyInspection[]>
  clear(): Promise<void>
}

class InMemoryPropertyInspectionStore implements PropertyInspectionStorePort {
  private inspections = new Map<string, PropertyInspection>()

  async create(input: CreatePropertyInspectionInput): Promise<PropertyInspection> {
    const now = new Date()
    const inspection: PropertyInspection = {
      id: randomUUID(),
      listingId: input.listingId,
      inspectorId: input.inspectorId,
      status: InspectionStatus.PENDING,
      scheduledAt: input.scheduledAt,
      createdAt: now,
      updatedAt: now,
    }

    this.inspections.set(inspection.id, inspection)
    return inspection
  }

  async getById(id: string): Promise<PropertyInspection | null> {
    return this.inspections.get(id) ?? null
  }

  async getByListingId(listingId: string): Promise<PropertyInspection[]> {
    return Array.from(this.inspections.values()).filter((i) => i.listingId === listingId)
  }

  async getByInspectorId(inspectorId: string): Promise<PropertyInspection[]> {
    return Array.from(this.inspections.values()).filter((i) => i.inspectorId === inspectorId)
  }

  async update(id: string, input: UpdatePropertyInspectionInput): Promise<PropertyInspection | null> {
    const inspection = this.inspections.get(id)
    if (!inspection) return null

    if (input.status !== undefined) inspection.status = input.status
    if (input.inspectorNotes !== undefined) inspection.inspectorNotes = input.inspectorNotes
    inspection.updatedAt = new Date()

    this.inspections.set(id, inspection)
    return inspection
  }

  async updateStatus(id: string, status: InspectionStatus): Promise<PropertyInspection | null> {
    const inspection = this.inspections.get(id)
    if (!inspection) return null

    inspection.status = status
    inspection.updatedAt = new Date()

    if (status === InspectionStatus.SUBMITTED) {
      inspection.submittedAt = new Date()
    } else if (status === InspectionStatus.APPROVED) {
      inspection.approvedAt = new Date()
    }

    this.inspections.set(id, inspection)
    return inspection
  }

  async list(filters?: { status?: InspectionStatus; inspectorId?: string }): Promise<PropertyInspection[]> {
    let results = Array.from(this.inspections.values())

    if (filters?.status) {
      results = results.filter((i) => i.status === filters.status)
    }

    if (filters?.inspectorId) {
      results = results.filter((i) => i.inspectorId === filters.inspectorId)
    }

    return results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  }

  async clear(): Promise<void> {
    this.inspections.clear()
  }
}

type PropertyInspectionRow = {
  id: string
  listing_id: string
  inspector_id: string
  status: string
  scheduled_at: Date | null
  submitted_at: Date | null
  approved_at: Date | null
  inspector_notes: string | null
  created_at: Date
  updated_at: Date
}

class PostgresPropertyInspectionStore implements PropertyInspectionStorePort {
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

  async create(input: CreatePropertyInspectionInput): Promise<PropertyInspection> {
    const pool = await this.pool()
    const id = randomUUID()
    const { rows } = await pool.query(
      `INSERT INTO property_inspections (id, listing_id, inspector_id, scheduled_at)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [id, input.listingId, input.inspectorId, input.scheduledAt ?? null],
    )

    return this.mapRow(rows[0] as PropertyInspectionRow)
  }

  async getById(id: string): Promise<PropertyInspection | null> {
    const pool = await this.pool()
    const { rows } = await pool.query(
      'SELECT * FROM property_inspections WHERE id = $1',
      [id],
    )

    if (rows.length === 0) return null
    return this.mapRow(rows[0] as PropertyInspectionRow)
  }

  async getByListingId(listingId: string): Promise<PropertyInspection[]> {
    const pool = await this.pool()
    const { rows } = await pool.query(
      'SELECT * FROM property_inspections WHERE listing_id = $1 ORDER BY created_at DESC',
      [listingId],
    )

    return rows.map((row) => this.mapRow(row as PropertyInspectionRow))
  }

  async getByInspectorId(inspectorId: string): Promise<PropertyInspection[]> {
    const pool = await this.pool()
    const { rows } = await pool.query(
      'SELECT * FROM property_inspections WHERE inspector_id = $1 ORDER BY created_at DESC',
      [inspectorId],
    )

    return rows.map((row) => this.mapRow(row as PropertyInspectionRow))
  }

  async update(id: string, input: UpdatePropertyInspectionInput): Promise<PropertyInspection | null> {
    const pool = await this.pool()
    const updates: string[] = []
    const values: unknown[] = []
    let paramIndex = 1

    if (input.status !== undefined) {
      updates.push(`status = $${paramIndex++}`)
      values.push(input.status)
    }

    if (input.inspectorNotes !== undefined) {
      updates.push(`inspector_notes = $${paramIndex++}`)
      values.push(input.inspectorNotes)
    }

    if (updates.length === 0) return this.getById(id)

    updates.push(`updated_at = NOW()`)
    values.push(id)

    const { rows } = await pool.query(
      `UPDATE property_inspections SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values,
    )

    if (rows.length === 0) return null
    return this.mapRow(rows[0] as PropertyInspectionRow)
  }

  async updateStatus(id: string, status: InspectionStatus): Promise<PropertyInspection | null> {
    const pool = await this.pool()
    const updates: string[] = ['status = $2', 'updated_at = NOW()']
    const values: unknown[] = [id, status]

    if (status === InspectionStatus.SUBMITTED) {
      updates.push('submitted_at = NOW()')
    } else if (status === InspectionStatus.APPROVED) {
      updates.push('approved_at = NOW()')
    }

    const { rows } = await pool.query(
      `UPDATE property_inspections SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
      values,
    )

    if (rows.length === 0) return null
    return this.mapRow(rows[0] as PropertyInspectionRow)
  }

  async list(filters?: { status?: InspectionStatus; inspectorId?: string }): Promise<PropertyInspection[]> {
    const pool = await this.pool()
    const where: string[] = []
    const values: unknown[] = []

    if (filters?.status) {
      values.push(filters.status)
      where.push(`status = $${values.length}`)
    }

    if (filters?.inspectorId) {
      values.push(filters.inspectorId)
      where.push(`inspector_id = $${values.length}`)
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const { rows } = await pool.query(
      `SELECT * FROM property_inspections ${whereClause} ORDER BY created_at DESC`,
      values,
    )

    return rows.map((row) => this.mapRow(row as PropertyInspectionRow))
  }

  async clear(): Promise<void> {
    const pool = await this.pool()
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('propertyInspectionStore.clear() is only supported in test env when using Postgres')
    }
    await pool.query('TRUNCATE property_inspections RESTART IDENTITY CASCADE')
  }

  private mapRow(row: PropertyInspectionRow): PropertyInspection {
    return {
      id: row.id,
      listingId: row.listing_id,
      inspectorId: row.inspector_id,
      status: row.status as InspectionStatus,
      scheduledAt: row.scheduled_at ? new Date(row.scheduled_at) : undefined,
      submittedAt: row.submitted_at ? new Date(row.submitted_at) : undefined,
      approvedAt: row.approved_at ? new Date(row.approved_at) : undefined,
      inspectorNotes: row.inspector_notes ?? undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }
  }
}

class HybridPropertyInspectionStore implements PropertyInspectionStorePort {
  private memory = new InMemoryPropertyInspectionStore()
  private postgres = new PostgresPropertyInspectionStore()

  private async adapter(): Promise<PropertyInspectionStorePort> {
    if (await this.postgres.isAvailable()) {
      return this.postgres
    }
    return this.memory
  }

  async create(input: CreatePropertyInspectionInput): Promise<PropertyInspection> {
    const adapter = await this.adapter()
    return adapter.create(input)
  }

  async getById(id: string): Promise<PropertyInspection | null> {
    const adapter = await this.adapter()
    return adapter.getById(id)
  }

  async getByListingId(listingId: string): Promise<PropertyInspection[]> {
    const adapter = await this.adapter()
    return adapter.getByListingId(listingId)
  }

  async getByInspectorId(inspectorId: string): Promise<PropertyInspection[]> {
    const adapter = await this.adapter()
    return adapter.getByInspectorId(inspectorId)
  }

  async update(id: string, input: UpdatePropertyInspectionInput): Promise<PropertyInspection | null> {
    const adapter = await this.adapter()
    return adapter.update(id, input)
  }

  async updateStatus(id: string, status: InspectionStatus): Promise<PropertyInspection | null> {
    const adapter = await this.adapter()
    return adapter.updateStatus(id, status)
  }

  async list(filters?: { status?: InspectionStatus; inspectorId?: string }): Promise<PropertyInspection[]> {
    const adapter = await this.adapter()
    return adapter.list(filters)
  }

  async clear(): Promise<void> {
    const adapter = await this.adapter()
    return adapter.clear()
  }
}

export const propertyInspectionStore = new HybridPropertyInspectionStore()
