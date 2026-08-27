import { randomUUID } from 'node:crypto'
import { getPool } from '../db.js'
import { logger } from '../utils/logger.js'

export type ErasureRequestStatus = 'pending' | 'completed' | 'cancelled' | 'expired'

export interface ErasureRequest {
  id: string
  userId: string
  status: ErasureRequestStatus
  requestedAt: Date
  confirmBy: Date
  confirmedAt: Date | null
  confirmedBy: string | null
}

const ERASURE_CONFIRM_DAYS = 30

function erasedToken(): string {
  return `[ERASED_${randomUUID()}]`
}

export class ErasureService {
  private async pool() {
    const pool = await getPool()
    if (!pool) throw new Error('Database not configured')
    return pool
  }

  async requestErasure(userId: string): Promise<ErasureRequest> {
    const pool = await this.pool()

    const existing = await pool.query(
      `SELECT id FROM erasure_requests WHERE user_id = $1 AND status = 'pending'`,
      [userId],
    )
    if (existing.rows.length > 0) {
      throw new Error('ERASURE_ALREADY_PENDING')
    }

    const confirmBy = new Date(Date.now() + ERASURE_CONFIRM_DAYS * 24 * 60 * 60 * 1000)
    const { rows } = await pool.query(
      `INSERT INTO erasure_requests (user_id, confirm_by)
       VALUES ($1, $2)
       RETURNING *`,
      [userId, confirmBy],
    )
    return this.mapRow(rows[0])
  }

  async findPendingByUserId(userId: string): Promise<ErasureRequest | null> {
    const pool = await this.pool()
    const { rows } = await pool.query(
      `SELECT * FROM erasure_requests WHERE user_id = $1 AND status = 'pending' ORDER BY requested_at DESC LIMIT 1`,
      [userId],
    )
    return rows.length > 0 ? this.mapRow(rows[0]) : null
  }

  async findById(id: string): Promise<ErasureRequest | null> {
    const pool = await this.pool()
    const { rows } = await pool.query(`SELECT * FROM erasure_requests WHERE id = $1`, [id])
    return rows.length > 0 ? this.mapRow(rows[0]) : null
  }

  /**
   * Anonymise PII fields but retain the user row and transaction records.
   * Financial records keep the same user_id as an anonymised reference.
   */
  async confirmErasure(requestId: string, adminUserId: string): Promise<void> {
    const pool = await this.pool()
    const request = await this.findById(requestId)
    if (!request) throw new Error('ERASURE_NOT_FOUND')
    if (request.status !== 'pending') throw new Error('ERASURE_NOT_PENDING')

    const token = erasedToken()
    const userId = request.userId

    await pool.query('BEGIN')
    try {
      await pool.query(
        `UPDATE users SET
           email = $2,
           name = $3,
           wallet_address = NULL,
           deactivated_at = NOW(),
           updated_at = NOW()
         WHERE id = $1`,
        [userId, `${token}@erased.local`, token],
      )

      await pool.query(
        `UPDATE landlord_profiles SET
           phone = $2,
           address = $2,
           account_number = $2,
           account_name = $2,
           bank_name = NULL,
           updated_at = NOW()
         WHERE user_id = $1`,
        [userId, token],
      )

      await pool.query(
        `UPDATE onboarding_drafts SET
           personal_info = jsonb_build_object('erased', true),
           employment_info = NULL,
           documents = NULL,
           wallet_info = NULL,
           updated_at = NOW()
         WHERE user_id = $1`,
        [userId],
      )

      await pool.query(
        `UPDATE kyc_documents SET
           front_image_key = $2,
           back_image_key = $2,
           liveness_signal = NULL,
           rejection_reason = NULL,
           updated_at = NOW()
         WHERE user_id = $1`,
        [userId, token],
      )

      await pool.query(
        `UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`,
        [userId],
      )

      await pool.query(
        `UPDATE erasure_requests SET
           status = 'completed',
           confirmed_at = NOW(),
           confirmed_by = $2,
           updated_at = NOW()
         WHERE id = $1`,
        [requestId, adminUserId],
      )

      await pool.query('COMMIT')
      logger.info('erasure.completed', { userId, requestId, adminUserId })
    } catch (err) {
      await pool.query('ROLLBACK')
      throw err
    }
  }

  async expireOverdueRequests(now = new Date()): Promise<number> {
    const pool = await this.pool()
    const { rowCount } = await pool.query(
      `UPDATE erasure_requests SET status = 'expired', updated_at = NOW()
       WHERE status = 'pending' AND confirm_by < $1`,
      [now],
    )
    return rowCount ?? 0
  }

  private mapRow(row: Record<string, unknown>): ErasureRequest {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      status: row.status as ErasureRequestStatus,
      requestedAt: new Date(row.requested_at as string),
      confirmBy: new Date(row.confirm_by as string),
      confirmedAt: row.confirmed_at ? new Date(row.confirmed_at as string) : null,
      confirmedBy: (row.confirmed_by as string) ?? null,
    }
  }
}

export const erasureService = new ErasureService()
