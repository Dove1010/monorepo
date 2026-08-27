import { randomUUID } from 'node:crypto'
import { getPool, type PgPoolLike } from '../db.js'
import {
  InspectionPhoto,
  CreateInspectionPhotoInput,
  UpdateInspectionPhotoInput,
} from './inspectionPhoto.js'

interface InspectionPhotoStorePort {
  create(input: CreateInspectionPhotoInput): Promise<InspectionPhoto>
  getById(id: string): Promise<InspectionPhoto | null>
  getByInspectionId(inspectionId: string): Promise<InspectionPhoto[]>
  update(id: string, input: UpdateInspectionPhotoInput): Promise<InspectionPhoto | null>
  delete(id: string): Promise<boolean>
  clear(): Promise<void>
}

class InMemoryInspectionPhotoStore implements InspectionPhotoStorePort {
  private photos = new Map<string, InspectionPhoto>()

  async create(input: CreateInspectionPhotoInput): Promise<InspectionPhoto> {
    const now = new Date()
    const photo: InspectionPhoto = {
      id: randomUUID(),
      inspectionId: input.inspectionId,
      url: input.url,
      caption: input.caption,
      takenAt: now,
      createdAt: now,
    }

    this.photos.set(photo.id, photo)
    return photo
  }

  async getById(id: string): Promise<InspectionPhoto | null> {
    return this.photos.get(id) ?? null
  }

  async getByInspectionId(inspectionId: string): Promise<InspectionPhoto[]> {
    return Array.from(this.photos.values()).filter((p) => p.inspectionId === inspectionId)
  }

  async update(id: string, input: UpdateInspectionPhotoInput): Promise<InspectionPhoto | null> {
    const photo = this.photos.get(id)
    if (!photo) return null

    if (input.caption !== undefined) photo.caption = input.caption
    photo.createdAt = new Date()

    this.photos.set(id, photo)
    return photo
  }

  async delete(id: string): Promise<boolean> {
    return this.photos.delete(id)
  }

  async clear(): Promise<void> {
    this.photos.clear()
  }
}

type InspectionPhotoRow = {
  id: string
  inspection_id: string
  url: string
  caption: string | null
  taken_at: Date
  created_at: Date
}

class PostgresInspectionPhotoStore implements InspectionPhotoStorePort {
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

  async create(input: CreateInspectionPhotoInput): Promise<InspectionPhoto> {
    const pool = await this.pool()
    const { rows } = await pool.query(
      `INSERT INTO inspection_photos (inspection_id, url, caption, taken_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING *`,
      [input.inspectionId, input.url, input.caption ?? null],
    )

    return this.mapRow(rows[0] as InspectionPhotoRow)
  }

  async getById(id: string): Promise<InspectionPhoto | null> {
    const pool = await this.pool()
    const { rows } = await pool.query(
      'SELECT * FROM inspection_photos WHERE id = $1',
      [id],
    )

    if (rows.length === 0) return null
    return this.mapRow(rows[0] as InspectionPhotoRow)
  }

  async getByInspectionId(inspectionId: string): Promise<InspectionPhoto[]> {
    const pool = await this.pool()
    const { rows } = await pool.query(
      'SELECT * FROM inspection_photos WHERE inspection_id = $1 ORDER BY taken_at DESC',
      [inspectionId],
    )

    return rows.map((row) => this.mapRow(row as InspectionPhotoRow))
  }

  async update(id: string, input: UpdateInspectionPhotoInput): Promise<InspectionPhoto | null> {
    const pool = await this.pool()
    const { rows } = await pool.query(
      `UPDATE inspection_photos
       SET caption = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, input.caption ?? null],
    )

    if (rows.length === 0) return null
    return this.mapRow(rows[0] as InspectionPhotoRow)
  }

  async delete(id: string): Promise<boolean> {
    const pool = await this.pool()
    const { rows } = await pool.query(
      'DELETE FROM inspection_photos WHERE id = $1 RETURNING id',
      [id],
    )

    return rows.length > 0
  }

  async clear(): Promise<void> {
    const pool = await this.pool()
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('inspectionPhotoStore.clear() is only supported in test env when using Postgres')
    }
    await pool.query('TRUNCATE inspection_photos RESTART IDENTITY CASCADE')
  }

  private mapRow(row: InspectionPhotoRow): InspectionPhoto {
    return {
      id: row.id,
      inspectionId: row.inspection_id,
      url: row.url,
      caption: row.caption ?? undefined,
      takenAt: new Date(row.taken_at),
      createdAt: new Date(row.created_at),
    }
  }
}

class HybridInspectionPhotoStore implements InspectionPhotoStorePort {
  private memory = new InMemoryInspectionPhotoStore()
  private postgres = new PostgresInspectionPhotoStore()

  private async adapter(): Promise<InspectionPhotoStorePort> {
    if (await this.postgres.isAvailable()) {
      return this.postgres
    }
    return this.memory
  }

  async create(input: CreateInspectionPhotoInput): Promise<InspectionPhoto> {
    const adapter = await this.adapter()
    return adapter.create(input)
  }

  async getById(id: string): Promise<InspectionPhoto | null> {
    const adapter = await this.adapter()
    return adapter.getById(id)
  }

  async getByInspectionId(inspectionId: string): Promise<InspectionPhoto[]> {
    const adapter = await this.adapter()
    return adapter.getByInspectionId(inspectionId)
  }

  async update(id: string, input: UpdateInspectionPhotoInput): Promise<InspectionPhoto | null> {
    const adapter = await this.adapter()
    return adapter.update(id, input)
  }

  async delete(id: string): Promise<boolean> {
    const adapter = await this.adapter()
    return adapter.delete(id)
  }

  async clear(): Promise<void> {
    const adapter = await this.adapter()
    return adapter.clear()
  }
}

export const inspectionPhotoStore = new HybridInspectionPhotoStore()
