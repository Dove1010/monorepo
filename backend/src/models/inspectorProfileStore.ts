import { randomUUID } from 'node:crypto'
import { getPool, type PgPoolLike } from '../db.js'
import {
  InspectorProfile,
  InspectorVerificationStatus,
  CreateInspectorProfileInput,
  UpdateInspectorProfileInput,
} from './inspectorProfile.js'

interface InspectorProfileStorePort {
  create(input: CreateInspectorProfileInput): Promise<InspectorProfile>
  getByUserId(userId: string): Promise<InspectorProfile | null>
  update(userId: string, input: UpdateInspectorProfileInput): Promise<InspectorProfile | null>
  updateVerificationStatus(userId: string, status: InspectorVerificationStatus): Promise<InspectorProfile | null>
  incrementCompletedInspections(userId: string): Promise<InspectorProfile | null>
  listVerified(): Promise<InspectorProfile[]>
  clear(): Promise<void>
}

class InMemoryInspectorProfileStore implements InspectorProfileStorePort {
  private profiles = new Map<string, InspectorProfile>()

  async create(input: CreateInspectorProfileInput): Promise<InspectorProfile> {
    const now = new Date()
    const profile: InspectorProfile = {
      userId: input.userId,
      verificationStatus: InspectorVerificationStatus.PENDING,
      bio: input.bio,
      serviceAreas: input.serviceAreas,
      completedInspections: 0,
      createdAt: now,
      updatedAt: now,
    }

    this.profiles.set(input.userId, profile)
    return profile
  }

  async getByUserId(userId: string): Promise<InspectorProfile | null> {
    return this.profiles.get(userId) ?? null
  }

  async update(userId: string, input: UpdateInspectorProfileInput): Promise<InspectorProfile | null> {
    const profile = this.profiles.get(userId)
    if (!profile) return null

    if (input.bio !== undefined) profile.bio = input.bio
    if (input.serviceAreas !== undefined) profile.serviceAreas = input.serviceAreas
    profile.updatedAt = new Date()

    this.profiles.set(userId, profile)
    return profile
  }

  async updateVerificationStatus(userId: string, status: InspectorVerificationStatus): Promise<InspectorProfile | null> {
    const profile = this.profiles.get(userId)
    if (!profile) return null

    profile.verificationStatus = status
    profile.updatedAt = new Date()

    this.profiles.set(userId, profile)
    return profile
  }

  async incrementCompletedInspections(userId: string): Promise<InspectorProfile | null> {
    const profile = this.profiles.get(userId)
    if (!profile) return null

    profile.completedInspections += 1
    profile.updatedAt = new Date()

    this.profiles.set(userId, profile)
    return profile
  }

  async listVerified(): Promise<InspectorProfile[]> {
    return Array.from(this.profiles.values()).filter(
      (p) => p.verificationStatus === InspectorVerificationStatus.VERIFIED,
    )
  }

  async clear(): Promise<void> {
    this.profiles.clear()
  }
}

type InspectorProfileRow = {
  user_id: string
  verification_status: string
  bio: string | null
  service_areas: unknown
  completed_inspections: number
  created_at: Date
  updated_at: Date
}

class PostgresInspectorProfileStore implements InspectorProfileStorePort {
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

  async create(input: CreateInspectorProfileInput): Promise<InspectorProfile> {
    const pool = await this.pool()
    const { rows } = await pool.query(
      `INSERT INTO inspector_profiles (user_id, verification_status, bio, service_areas)
       VALUES ($1, $2, $3, $4::jsonb)
       RETURNING *`,
      [input.userId, InspectorVerificationStatus.PENDING, input.bio ?? null, JSON.stringify(input.serviceAreas)],
    )

    return this.mapRow(rows[0] as InspectorProfileRow)
  }

  async getByUserId(userId: string): Promise<InspectorProfile | null> {
    const pool = await this.pool()
    const { rows } = await pool.query(
      'SELECT * FROM inspector_profiles WHERE user_id = $1',
      [userId],
    )

    if (rows.length === 0) return null
    return this.mapRow(rows[0] as InspectorProfileRow)
  }

  async update(userId: string, input: UpdateInspectorProfileInput): Promise<InspectorProfile | null> {
    const pool = await this.pool()
    const updates: string[] = []
    const values: unknown[] = []
    let paramIndex = 1

    if (input.bio !== undefined) {
      updates.push(`bio = $${paramIndex++}`)
      values.push(input.bio)
    }

    if (input.serviceAreas !== undefined) {
      updates.push(`service_areas = $${paramIndex++}`)
      values.push(JSON.stringify(input.serviceAreas))
    }

    if (updates.length === 0) return this.getByUserId(userId)

    updates.push(`updated_at = NOW()`)
    values.push(userId)

    const { rows } = await pool.query(
      `UPDATE inspector_profiles SET ${updates.join(', ')} WHERE user_id = $${paramIndex} RETURNING *`,
      values,
    )

    if (rows.length === 0) return null
    return this.mapRow(rows[0] as InspectorProfileRow)
  }

  async updateVerificationStatus(userId: string, status: InspectorVerificationStatus): Promise<InspectorProfile | null> {
    const pool = await this.pool()
    const { rows } = await pool.query(
      `UPDATE inspector_profiles
       SET verification_status = $2, updated_at = NOW()
       WHERE user_id = $1
       RETURNING *`,
      [userId, status],
    )

    if (rows.length === 0) return null
    return this.mapRow(rows[0] as InspectorProfileRow)
  }

  async incrementCompletedInspections(userId: string): Promise<InspectorProfile | null> {
    const pool = await this.pool()
    const { rows } = await pool.query(
      `UPDATE inspector_profiles
       SET completed_inspections = completed_inspections + 1, updated_at = NOW()
       WHERE user_id = $1
       RETURNING *`,
      [userId],
    )

    if (rows.length === 0) return null
    return this.mapRow(rows[0] as InspectorProfileRow)
  }

  async listVerified(): Promise<InspectorProfile[]> {
    const pool = await this.pool()
    const { rows } = await pool.query(
      `SELECT * FROM inspector_profiles WHERE verification_status = $1`,
      [InspectorVerificationStatus.VERIFIED],
    )

    return rows.map((row) => this.mapRow(row as InspectorProfileRow))
  }

  async clear(): Promise<void> {
    const pool = await this.pool()
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('inspectorProfileStore.clear() is only supported in test env when using Postgres')
    }
    await pool.query('TRUNCATE inspector_profiles RESTART IDENTITY CASCADE')
  }

  private mapRow(row: InspectorProfileRow): InspectorProfile {
    const serviceAreasValue = row.service_areas
    const serviceAreas = Array.isArray(serviceAreasValue)
      ? (serviceAreasValue as string[])
      : typeof serviceAreasValue === 'string'
        ? (JSON.parse(serviceAreasValue) as string[])
        : []

    return {
      userId: row.user_id,
      verificationStatus: row.verification_status as InspectorVerificationStatus,
      bio: row.bio ?? undefined,
      serviceAreas,
      completedInspections: row.completed_inspections,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }
  }
}

class HybridInspectorProfileStore implements InspectorProfileStorePort {
  private memory = new InMemoryInspectorProfileStore()
  private postgres = new PostgresInspectorProfileStore()

  private async adapter(): Promise<InspectorProfileStorePort> {
    if (await this.postgres.isAvailable()) {
      return this.postgres
    }
    return this.memory
  }

  async create(input: CreateInspectorProfileInput): Promise<InspectorProfile> {
    const adapter = await this.adapter()
    return adapter.create(input)
  }

  async getByUserId(userId: string): Promise<InspectorProfile | null> {
    const adapter = await this.adapter()
    return adapter.getByUserId(userId)
  }

  async update(userId: string, input: UpdateInspectorProfileInput): Promise<InspectorProfile | null> {
    const adapter = await this.adapter()
    return adapter.update(userId, input)
  }

  async updateVerificationStatus(userId: string, status: InspectorVerificationStatus): Promise<InspectorProfile | null> {
    const adapter = await this.adapter()
    return adapter.updateVerificationStatus(userId, status)
  }

  async incrementCompletedInspections(userId: string): Promise<InspectorProfile | null> {
    const adapter = await this.adapter()
    return adapter.incrementCompletedInspections(userId)
  }

  async listVerified(): Promise<InspectorProfile[]> {
    const adapter = await this.adapter()
    return adapter.listVerified()
  }

  async clear(): Promise<void> {
    const adapter = await this.adapter()
    return adapter.clear()
  }
}

export const inspectorProfileStore = new HybridInspectorProfileStore()
