import { getPool } from '../db.js'
import type {
  TenantDocumentRecord,
  TenantDocumentResponse,
  DocumentCategory,
} from '../schemas/tenantDocument.js'

export interface CreateDocumentInput {
  fileName: string
  fileFormat: string
  fileSizeBytes: number
  storageKey: string
  category: DocumentCategory
  description?: string | null
  dealId?: string | null
  isLandlordUploaded?: boolean
  readOnly?: boolean
}

export interface ListFilters {
  category?: DocumentCategory
  dealId?: string
  page?: number
  pageSize?: number
}

export class TenantDocumentRepository {
  async create(userId: string, input: CreateDocumentInput): Promise<TenantDocumentResponse> {
    const pool = await getPool()
    if (!pool) throw new Error('Database not configured')

    const { rows } = await pool.query(
      `INSERT INTO tenant_documents (
        user_id, file_name, file_format, file_size_bytes, storage_key, category,
        description, deal_id, is_landlord_uploaded, read_only
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, user_id, file_name, file_format, file_size_bytes, category, description, deal_id, is_landlord_uploaded, created_at`,
      [
        userId,
        input.fileName,
        input.fileFormat,
        input.fileSizeBytes,
        input.storageKey,
        input.category,
        input.description ?? null,
        input.dealId ?? null,
        input.isLandlordUploaded ?? false,
        input.readOnly ?? false,
      ],
    )

    const row = rows[0]
    return {
      id: row.id,
      userId: row.user_id,
      fileName: row.file_name,
      fileFormat: row.file_format,
      fileSizeBytes: row.file_size_bytes,
      category: row.category,
      description: row.description,
      dealId: row.deal_id,
      isLandlordUploaded: row.is_landlord_uploaded,
      createdAt: row.created_at,
    }
  }

  async findById(id: string, userId: string): Promise<TenantDocumentResponse | null> {
    const pool = await getPool()
    if (!pool) throw new Error('Database not configured')

    const { rows } = await pool.query(
      `SELECT id, user_id, file_name, file_format, file_size_bytes, category, description, deal_id, is_landlord_uploaded, created_at
       FROM tenant_documents WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [id, userId],
    )

    if (rows.length === 0) return null

    const row = rows[0]
    return {
      id: row.id,
      userId: row.user_id,
      fileName: row.file_name,
      fileFormat: row.file_format,
      fileSizeBytes: row.file_size_bytes,
      category: row.category,
      description: row.description,
      dealId: row.deal_id,
      isLandlordUploaded: row.is_landlord_uploaded,
      createdAt: row.created_at,
    }
  }

  async list(
    userId: string,
    filters?: ListFilters,
  ): Promise<{
    documents: TenantDocumentResponse[]
    total: number
    page: number
    pageSize: number
  }> {
    const pool = await getPool()
    if (!pool) throw new Error('Database not configured')

    const conditions: string[] = ['user_id = $1', 'deleted_at IS NULL']
    const params: unknown[] = [userId]
    let paramIndex = 2

    if (filters?.category) {
      conditions.push(`category = $${paramIndex++}`)
      params.push(filters.category)
    }

    if (filters?.dealId) {
      conditions.push(`deal_id = $${paramIndex++}`)
      params.push(filters.dealId)
    }

    const where = conditions.join(' AND ')
    const page = filters?.page ?? 1
    const pageSize = Math.min(100, filters?.pageSize ?? 20)
    const offset = (page - 1) * pageSize

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM tenant_documents WHERE ${where}`,
      params,
    )
    const total = countResult.rows[0].total

    const dataResult = await pool.query(
      `SELECT id, user_id, file_name, file_format, file_size_bytes, category, description, deal_id, is_landlord_uploaded, created_at
       FROM tenant_documents WHERE ${where}
       ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      [...params, pageSize, offset],
    )

    const documents = dataResult.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      fileName: row.file_name,
      fileFormat: row.file_format,
      fileSizeBytes: row.file_size_bytes,
      category: row.category,
      description: row.description,
      dealId: row.deal_id,
      isLandlordUploaded: row.is_landlord_uploaded,
      createdAt: row.created_at,
    }))

    return { documents, total, page, pageSize }
  }

  async delete(id: string, userId: string): Promise<{ storageKey: string | null; deleted: boolean }> {
    const pool = await getPool()
    if (!pool) throw new Error('Database not configured')

    const { rows, rowCount } = await pool.query(
      `UPDATE tenant_documents SET deleted_at = NOW() WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL RETURNING storage_key`,
      [id, userId],
    )

    if ((rowCount ?? 0) === 0) {
      return { storageKey: null, deleted: false }
    }

    return { storageKey: rows[0].storage_key, deleted: true }
  }

  async getTotalStorageBytes(userId: string): Promise<number> {
    const pool = await getPool()
    if (!pool) throw new Error('Database not configured')

    const { rows } = await pool.query(
      `SELECT COALESCE(SUM(file_size_bytes), 0)::int AS total FROM tenant_documents WHERE user_id = $1 AND deleted_at IS NULL`,
      [userId],
    )

    return rows[0].total ?? 0
  }

  async getStorageKey(id: string, userId: string): Promise<string | null> {
    const pool = await getPool()
    if (!pool) throw new Error('Database not configured')

    const { rows } = await pool.query(
      `SELECT storage_key FROM tenant_documents WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [id, userId],
    )

    if (rows.length === 0) return null
    return rows[0].storage_key
  }
}

export const tenantDocumentRepository = new TenantDocumentRepository()
