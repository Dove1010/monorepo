import { randomUUID } from 'node:crypto'
import { getPool, type PgPoolLike } from '../db.js'
import type { CreateSupportMessageInput, SupportMessage } from './supportMessage.js'

interface SupportMessageStorePort {
  create(input: CreateSupportMessageInput): Promise<SupportMessage>
  listAll(): Promise<SupportMessage[]>
  clear(): Promise<void>
}

class InMemorySupportMessageStore implements SupportMessageStorePort {
  private messages: SupportMessage[] = []

  async create(input: CreateSupportMessageInput): Promise<SupportMessage> {
    const created: SupportMessage = {
      messageId: randomUUID(),
      name: input.name,
      email: input.email,
      phone: input.phone,
      subject: input.subject,
      message: input.message,
      ip: input.ip,
      userAgent: input.userAgent,
      createdAt: new Date(),
    }
    this.messages.unshift(created)
    return created
  }

  async listAll(): Promise<SupportMessage[]> {
    return [...this.messages]
  }

  async clear(): Promise<void> {
    this.messages = []
  }
}

type SupportMessageRow = {
  message_id: string
  name: string
  email: string
  phone: string | null
  subject: string
  message: string
  ip: string | null
  user_agent: string | null
  created_at: Date
}

class PostgresSupportMessageStore implements SupportMessageStorePort {
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

  async create(input: CreateSupportMessageInput): Promise<SupportMessage> {
    const pool = await this.pool()
    const messageId = randomUUID()

    const { rows } = await pool.query(
      `INSERT INTO support_messages (
        message_id,
        name,
        email,
        phone,
        subject,
        message,
        ip,
        user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        messageId,
        input.name,
        input.email,
        input.phone ?? null,
        input.subject,
        input.message,
        input.ip ?? null,
        input.userAgent ?? null,
      ],
    )

    return this.mapRow(rows[0] as SupportMessageRow)
  }

  async listAll(): Promise<SupportMessage[]> {
    const pool = await this.pool()
    const { rows } = await pool.query(
      `SELECT * FROM support_messages WHERE deleted_at IS NULL ORDER BY created_at DESC`,
    )
    return rows.map((r) => this.mapRow(r as SupportMessageRow))
  }

  async clear(): Promise<void> {
    const pool = await this.pool()
    if (process.env.NODE_ENV !== 'test') {
      throw new Error(
        'supportMessageStore.clear() is only supported in test env when using Postgres',
      )
    }
    await pool.query('TRUNCATE support_messages RESTART IDENTITY CASCADE')
  }

  private mapRow(row: SupportMessageRow): SupportMessage {
    return {
      messageId: row.message_id,
      name: row.name,
      email: row.email,
      phone: row.phone ?? undefined,
      subject: row.subject,
      message: row.message,
      ip: row.ip ?? undefined,
      userAgent: row.user_agent ?? undefined,
      createdAt: new Date(row.created_at),
    }
  }
}

class HybridSupportMessageStore implements SupportMessageStorePort {
  private memory = new InMemorySupportMessageStore()
  private postgres = new PostgresSupportMessageStore()

  private async adapter(): Promise<SupportMessageStorePort> {
    if (await this.postgres.isAvailable()) return this.postgres
    return this.memory
  }

  async create(input: CreateSupportMessageInput): Promise<SupportMessage> {
    return (await this.adapter()).create(input)
  }

  async listAll(): Promise<SupportMessage[]> {
    return (await this.adapter()).listAll()
  }

  async clear(): Promise<void> {
    return (await this.adapter()).clear()
  }
}

export const supportMessageStore = new HybridSupportMessageStore()

