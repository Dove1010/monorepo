import { getPool } from '../db.js'
import { InspectionJob, InspectionReport, InspectionJobStatus } from '../services/inspectorService.js'

interface InspectionJobRow {
  id: string
  listing_id: string
  inspector_id: string | null
  status: string
  offered_fee_ngn: string | number
  claim_deadline: Date | null
  submitted_at: Date | null
  approved_at: Date | null
  rejection_reason: string | null
  created_at: Date
  updated_at: Date
}

interface InspectionReportRow {
  id: string
  job_id: string
  overall_grade: string
  room_checklist: unknown
  photo_keys: string[]
  notes: string
  submitted_at: Date
}

export class InspectionJobRepository {
  private async pool() {
    const pool = await getPool()
    if (!pool) throw new Error('Database pool is not available')
    return pool
  }

  async create(listingId: string, offeredFeeNgn: number): Promise<InspectionJob> {
    const pool = await this.pool()
    const { rows } = await pool.query(
      `INSERT INTO inspection_jobs (listing_id, offered_fee_ngn)
       VALUES ($1, $2)
       RETURNING *`,
      [listingId, offeredFeeNgn],
    )
    return this.mapJobRow(rows[0] as InspectionJobRow)
  }

  async getById(jobId: string): Promise<InspectionJob | null> {
    const pool = await this.pool()
    const { rows } = await pool.query(
      `SELECT * FROM inspection_jobs WHERE id = $1`,
      [jobId],
    )
    if (rows.length === 0) return null
    return this.mapJobRow(rows[0] as InspectionJobRow)
  }

  async getByListingId(listingId: string): Promise<InspectionJob[]> {
    const pool = await this.pool()
    const { rows } = await pool.query(
      `SELECT * FROM inspection_jobs WHERE listing_id = $1 ORDER BY created_at DESC`,
      [listingId],
    )
    return rows.map((r: InspectionJobRow) => this.mapJobRow(r))
  }

  async listByStatus(status: InspectionJobStatus): Promise<InspectionJob[]> {
    const pool = await this.pool()
    const { rows } = await pool.query(
      `SELECT * FROM inspection_jobs WHERE status = $1 ORDER BY created_at DESC`,
      [status],
    )
    return rows.map((r: InspectionJobRow) => this.mapJobRow(r))
  }

  async listAll(): Promise<InspectionJob[]> {
    const pool = await this.pool()
    const { rows } = await pool.query(
      `SELECT * FROM inspection_jobs ORDER BY created_at DESC`,
    )
    return rows.map((r: InspectionJobRow) => this.mapJobRow(r))
  }

  async listAvailable(): Promise<InspectionJob[]> {
    const pool = await this.pool()
    const { rows } = await pool.query(
      `SELECT * FROM inspection_jobs WHERE status = 'available' ORDER BY created_at DESC`,
    )
    return rows.map((r: InspectionJobRow) => this.mapJobRow(r))
  }

  async claim(jobId: string, inspectorId: string): Promise<InspectionJob | null> {
    const pool = await this.pool()
    const { rows } = await pool.query(
      `UPDATE inspection_jobs
       SET status = 'claimed',
           inspector_id = $2,
           updated_at = NOW()
       WHERE id = $1 AND status = 'available'
       RETURNING *`,
      [jobId, inspectorId],
    )
    if (rows.length === 0) return null
    return this.mapJobRow(rows[0] as InspectionJobRow)
  }

  async startProgress(jobId: string, inspectorId: string): Promise<InspectionJob | null> {
    const pool = await this.pool()
    const { rows } = await pool.query(
      `UPDATE inspection_jobs
       SET status = 'in_progress',
           updated_at = NOW()
       WHERE id = $1 AND inspector_id = $2 AND status = 'claimed'
       RETURNING *`,
      [jobId, inspectorId],
    )
    if (rows.length === 0) return null
    return this.mapJobRow(rows[0] as InspectionJobRow)
  }

  async submitReport(jobId: string, inspectorId: string, reportId: string): Promise<InspectionJob | null> {
    const pool = await this.pool()
    const { rows } = await pool.query(
      `UPDATE inspection_jobs
       SET status = 'submitted',
           submitted_at = NOW(),
           updated_at = NOW()
       WHERE id = $1 AND inspector_id = $2 AND status IN ('claimed', 'in_progress')
       RETURNING *`,
      [jobId, inspectorId],
    )
    if (rows.length === 0) return null
    return this.mapJobRow(rows[0] as InspectionJobRow)
  }

  async approve(jobId: string): Promise<InspectionJob | null> {
    const pool = await this.pool()
    const { rows } = await pool.query(
      `UPDATE inspection_jobs
       SET status = 'approved',
           approved_at = NOW(),
           updated_at = NOW()
       WHERE id = $1 AND status = 'submitted'
       RETURNING *`,
      [jobId],
    )
    if (rows.length === 0) return null
    return this.mapJobRow(rows[0] as InspectionJobRow)
  }

  async reject(jobId: string, reason: string): Promise<InspectionJob | null> {
    const pool = await this.pool()
    const { rows } = await pool.query(
      `UPDATE inspection_jobs
       SET status = 'available',
           inspector_id = NULL,
           rejection_reason = $2,
           updated_at = NOW()
       WHERE id = $1 AND status = 'submitted'
       RETURNING *`,
      [jobId, reason],
    )
    if (rows.length === 0) return null
    return this.mapJobRow(rows[0] as InspectionJobRow)
  }

  async createReport(report: {
    jobId: string
    overallGrade: string
    roomChecklist: Record<string, unknown>
    photoKeys: string[]
    notes: string
  }): Promise<InspectionReport> {
    const pool = await this.pool()
    const { rows } = await pool.query(
      `INSERT INTO inspection_reports (job_id, overall_grade, room_checklist, photo_keys, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        report.jobId,
        report.overallGrade,
        JSON.stringify(report.roomChecklist),
        report.photoKeys,
        report.notes,
      ],
    )
    return this.mapReportRow(rows[0] as InspectionReportRow)
  }

  async getReportByJobId(jobId: string): Promise<InspectionReport | null> {
    const pool = await this.pool()
    const { rows } = await pool.query(
      `SELECT * FROM inspection_reports WHERE job_id = $1`,
      [jobId],
    )
    if (rows.length === 0) return null
    return this.mapReportRow(rows[0] as InspectionReportRow)
  }

  private mapJobRow(row: InspectionJobRow): InspectionJob {
    return {
      id: row.id,
      listingId: row.listing_id,
      inspectorId: row.inspector_id ?? undefined,
      status: row.status as InspectionJobStatus,
      offeredFeeNgn: toNumber(row.offered_fee_ngn),
      claimDeadline: row.claim_deadline ? new Date(row.claim_deadline) : undefined,
      submittedAt: row.submitted_at ? new Date(row.submitted_at) : undefined,
      approvedAt: row.approved_at ? new Date(row.approved_at) : undefined,
      rejectionReason: row.rejection_reason ?? undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }
  }

  private mapReportRow(row: InspectionReportRow): InspectionReport {
    const checklist = row.room_checklist
    return {
      id: row.id,
      jobId: row.job_id,
      overallGrade: row.overall_grade as InspectionReport['overallGrade'],
      roomChecklist: typeof checklist === 'string' ? JSON.parse(checklist) : checklist as Record<string, unknown>,
      photoKeys: row.photo_keys,
      notes: row.notes,
      submittedAt: new Date(row.submitted_at),
    }
  }
}

function toNumber(value: string | number): number {
  return typeof value === 'number' ? value : Number(value)
}

export const inspectionJobRepository = new InspectionJobRepository()
