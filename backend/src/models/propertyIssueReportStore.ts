import { randomUUID } from 'node:crypto'
import { getPool, type PgPoolLike } from '../db.js'
import type {
  CreatePropertyIssueReportInput,
  PropertyIssueReport,
} from './propertyIssueReport.js'

interface PropertyIssueReportStorePort {
  create(input: CreatePropertyIssueReportInput): Promise<PropertyIssueReport>
  listAll(): Promise<PropertyIssueReport[]>
  clear(): Promise<void>
}

class InMemoryPropertyIssueReportStore implements PropertyIssueReportStorePort {
  private reports: PropertyIssueReport[] = []

  async create(input: CreatePropertyIssueReportInput): Promise<PropertyIssueReport> {
    const created: PropertyIssueReport = {
      reportId: randomUUID(),
      propertyId: input.propertyId,
      category: input.category,
      details: input.details,
      ip: input.ip,
      userAgent: input.userAgent,
      createdAt: new Date(),
    }
    this.reports.unshift(created)
    return created
  }

  async listAll(): Promise<PropertyIssueReport[]> {
    return [...this.reports]
  }

  async clear(): Promise<void> {
    this.reports = []
  }
}

type ReportRow = {
  report_id: string
  property_id: string
  category: string
  details: string
  ip: string | null
  user_agent: string | null
  created_at: Date
}

class PostgresPropertyIssueReportStore implements PropertyIssueReportStorePort {
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

  async create(input: CreatePropertyIssueReportInput): Promise<PropertyIssueReport> {
    const pool = await this.pool()
    const reportId = randomUUID()
    const { rows } = await pool.query(
      `INSERT INTO property_issue_reports (
        report_id,
        property_id,
        category,
        details,
        ip,
        user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [
        reportId,
        input.propertyId,
        input.category,
        input.details,
        input.ip ?? null,
        input.userAgent ?? null,
      ],
    )
    return this.mapRow(rows[0] as ReportRow)
  }

  async listAll(): Promise<PropertyIssueReport[]> {
    const pool = await this.pool()
    const { rows } = await pool.query(
      `SELECT * FROM property_issue_reports ORDER BY created_at DESC`,
    )
    return rows.map((r) => this.mapRow(r as ReportRow))
  }

  async clear(): Promise<void> {
    const pool = await this.pool()
    if (process.env.NODE_ENV !== 'test') {
      throw new Error(
        'propertyIssueReportStore.clear() is only supported in test env when using Postgres',
      )
    }
    await pool.query('TRUNCATE property_issue_reports RESTART IDENTITY CASCADE')
  }

  private mapRow(row: ReportRow): PropertyIssueReport {
    return {
      reportId: row.report_id,
      propertyId: row.property_id,
      category: row.category,
      details: row.details,
      ip: row.ip ?? undefined,
      userAgent: row.user_agent ?? undefined,
      createdAt: new Date(row.created_at),
    }
  }
}

class HybridPropertyIssueReportStore implements PropertyIssueReportStorePort {
  private memory = new InMemoryPropertyIssueReportStore()
  private postgres = new PostgresPropertyIssueReportStore()

  private async adapter(): Promise<PropertyIssueReportStorePort> {
    if (await this.postgres.isAvailable()) return this.postgres
    return this.memory
  }

  async create(input: CreatePropertyIssueReportInput): Promise<PropertyIssueReport> {
    return (await this.adapter()).create(input)
  }

  async listAll(): Promise<PropertyIssueReport[]> {
    return (await this.adapter()).listAll()
  }

  async clear(): Promise<void> {
    return (await this.adapter()).clear()
  }
}

export const propertyIssueReportStore = new HybridPropertyIssueReportStore()

