import { randomUUID } from 'node:crypto'
import { getPool, type PgPoolLike } from '../db.js'
import {
  InspectionChecklistItem,
  ChecklistCategory,
  ChecklistResult,
  CreateChecklistItemInput,
  UpdateChecklistItemInput,
} from './inspectionChecklistItem.js'

interface InspectionChecklistItemStorePort {
  create(input: CreateChecklistItemInput): Promise<InspectionChecklistItem>
  getById(id: string): Promise<InspectionChecklistItem | null>
  getByInspectionId(inspectionId: string): Promise<InspectionChecklistItem[]>
  update(id: string, input: UpdateChecklistItemInput): Promise<InspectionChecklistItem | null>
  delete(id: string): Promise<boolean>
  getByCategory(inspectionId: string, category: ChecklistCategory): Promise<InspectionChecklistItem[]>
  clear(): Promise<void>
}

class InMemoryInspectionChecklistItemStore implements InspectionChecklistItemStorePort {
  private items = new Map<string, InspectionChecklistItem>()

  async create(input: CreateChecklistItemInput): Promise<InspectionChecklistItem> {
    const now = new Date()
    const item: InspectionChecklistItem = {
      id: randomUUID(),
      inspectionId: input.inspectionId,
      category: input.category,
      item: input.item,
      result: input.result,
      notes: input.notes,
      createdAt: now,
      updatedAt: now,
    }

    this.items.set(item.id, item)
    return item
  }

  async getById(id: string): Promise<InspectionChecklistItem | null> {
    return this.items.get(id) ?? null
  }

  async getByInspectionId(inspectionId: string): Promise<InspectionChecklistItem[]> {
    return Array.from(this.items.values()).filter((i) => i.inspectionId === inspectionId)
  }

  async update(id: string, input: UpdateChecklistItemInput): Promise<InspectionChecklistItem | null> {
    const item = this.items.get(id)
    if (!item) return null

    if (input.result !== undefined) item.result = input.result
    if (input.notes !== undefined) item.notes = input.notes
    item.updatedAt = new Date()

    this.items.set(id, item)
    return item
  }

  async delete(id: string): Promise<boolean> {
    return this.items.delete(id)
  }

  async getByCategory(inspectionId: string, category: ChecklistCategory): Promise<InspectionChecklistItem[]> {
    return Array.from(this.items.values()).filter(
      (i) => i.inspectionId === inspectionId && i.category === category,
    )
  }

  async clear(): Promise<void> {
    this.items.clear()
  }
}

type InspectionChecklistItemRow = {
  id: string
  inspection_id: string
  category: string
  item: string
  result: string
  notes: string | null
  created_at: Date
  updated_at: Date
}

class PostgresInspectionChecklistItemStore implements InspectionChecklistItemStorePort {
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

  async create(input: CreateChecklistItemInput): Promise<InspectionChecklistItem> {
    const pool = await this.pool()
    const { rows } = await pool.query(
      `INSERT INTO inspection_checklist_items (inspection_id, category, item, result, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [input.inspectionId, input.category, input.item, input.result, input.notes ?? null],
    )

    return this.mapRow(rows[0] as InspectionChecklistItemRow)
  }

  async getById(id: string): Promise<InspectionChecklistItem | null> {
    const pool = await this.pool()
    const { rows } = await pool.query(
      'SELECT * FROM inspection_checklist_items WHERE id = $1',
      [id],
    )

    if (rows.length === 0) return null
    return this.mapRow(rows[0] as InspectionChecklistItemRow)
  }

  async getByInspectionId(inspectionId: string): Promise<InspectionChecklistItem[]> {
    const pool = await this.pool()
    const { rows } = await pool.query(
      'SELECT * FROM inspection_checklist_items WHERE inspection_id = $1 ORDER BY category, item',
      [inspectionId],
    )

    return rows.map((row) => this.mapRow(row as InspectionChecklistItemRow))
  }

  async update(id: string, input: UpdateChecklistItemInput): Promise<InspectionChecklistItem | null> {
    const pool = await this.pool()
    const updates: string[] = []
    const values: unknown[] = []
    let paramIndex = 1

    if (input.result !== undefined) {
      updates.push(`result = $${paramIndex++}`)
      values.push(input.result)
    }

    if (input.notes !== undefined) {
      updates.push(`notes = $${paramIndex++}`)
      values.push(input.notes)
    }

    if (updates.length === 0) return this.getById(id)

    updates.push(`updated_at = NOW()`)
    values.push(id)

    const { rows } = await pool.query(
      `UPDATE inspection_checklist_items SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values,
    )

    if (rows.length === 0) return null
    return this.mapRow(rows[0] as InspectionChecklistItemRow)
  }

  async delete(id: string): Promise<boolean> {
    const pool = await this.pool()
    const { rows } = await pool.query(
      'DELETE FROM inspection_checklist_items WHERE id = $1 RETURNING id',
      [id],
    )

    return rows.length > 0
  }

  async getByCategory(inspectionId: string, category: ChecklistCategory): Promise<InspectionChecklistItem[]> {
    const pool = await this.pool()
    const { rows } = await pool.query(
      'SELECT * FROM inspection_checklist_items WHERE inspection_id = $1 AND category = $2 ORDER BY item',
      [inspectionId, category],
    )

    return rows.map((row) => this.mapRow(row as InspectionChecklistItemRow))
  }

  async clear(): Promise<void> {
    const pool = await this.pool()
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('inspectionChecklistItemStore.clear() is only supported in test env when using Postgres')
    }
    await pool.query('TRUNCATE inspection_checklist_items RESTART IDENTITY CASCADE')
  }

  private mapRow(row: InspectionChecklistItemRow): InspectionChecklistItem {
    return {
      id: row.id,
      inspectionId: row.inspection_id,
      category: row.category as ChecklistCategory,
      item: row.item,
      result: row.result as ChecklistResult,
      notes: row.notes ?? undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }
  }
}

class HybridInspectionChecklistItemStore implements InspectionChecklistItemStorePort {
  private memory = new InMemoryInspectionChecklistItemStore()
  private postgres = new PostgresInspectionChecklistItemStore()

  private async adapter(): Promise<InspectionChecklistItemStorePort> {
    if (await this.postgres.isAvailable()) {
      return this.postgres
    }
    return this.memory
  }

  async create(input: CreateChecklistItemInput): Promise<InspectionChecklistItem> {
    const adapter = await this.adapter()
    return adapter.create(input)
  }

  async getById(id: string): Promise<InspectionChecklistItem | null> {
    const adapter = await this.adapter()
    return adapter.getById(id)
  }

  async getByInspectionId(inspectionId: string): Promise<InspectionChecklistItem[]> {
    const adapter = await this.adapter()
    return adapter.getByInspectionId(inspectionId)
  }

  async update(id: string, input: UpdateChecklistItemInput): Promise<InspectionChecklistItem | null> {
    const adapter = await this.adapter()
    return adapter.update(id, input)
  }

  async delete(id: string): Promise<boolean> {
    const adapter = await this.adapter()
    return adapter.delete(id)
  }

  async getByCategory(inspectionId: string, category: ChecklistCategory): Promise<InspectionChecklistItem[]> {
    const adapter = await this.adapter()
    return adapter.getByCategory(inspectionId, category)
  }

  async clear(): Promise<void> {
    const adapter = await this.adapter()
    return adapter.clear()
  }
}

export const inspectionChecklistItemStore = new HybridInspectionChecklistItemStore()
