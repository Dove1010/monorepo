/**
 * Tenant Document Vault — presigned upload/download URLs (issue #969)
 */

import { Router, type Request, type Response, type NextFunction } from 'express'
import { authenticateToken } from '../middleware/auth.js'
import { AppError } from '../errors/AppError.js'
import { ErrorCode } from '../errors/errorCodes.js'
import {
  uploadUrlRequestSchema,
  confirmUploadSchema,
  type DocumentDocType,
} from '../schemas/tenantDocumentPresign.js'
import { contentTypeToExtension } from '../services/storageService.js'
import {
  buildTenantDocumentObjectKey,
  generatePresignedUpload,
  generatePresignedDownload,
  STORAGE_TTL,
} from '../services/storageService.js'
import { getTenantDocumentVaultStore } from '../models/tenantDocumentVaultStore.js'
import { auditLog, extractAuditContext } from '../utils/auditLogger.js'

const router = Router()

function requireTenant(req: Request): string {
  const user = (req as Request & { user?: { id?: string } }).user
  if (!user?.id) {
    throw new AppError(ErrorCode.UNAUTHORIZED, 401, 'User not authenticated')
  }
  return user.id
}

/**
 * POST /api/documents/upload-url
 */
router.post(
  '/upload-url',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = requireTenant(req)
      const parsed = uploadUrlRequestSchema.safeParse(req.body)
      if (!parsed.success) {
        throw new AppError(
          ErrorCode.VALIDATION_ERROR,
          400,
          parsed.error.issues.map((i) => i.message).join(', ') || 'Invalid docType or contentType',
        )
      }

      const { docType, contentType } = parsed.data
      const objectKey = buildTenantDocumentObjectKey(userId, docType, contentType)
      const { uploadUrl, expiresAt } = await generatePresignedUpload(objectKey, contentType)

      const store = getTenantDocumentVaultStore()
      const doc = await store.createPendingUpload(userId, {
        docType,
        contentType,
        objectKey,
      })

      auditLog('DOCUMENT_UPLOAD_URL_ISSUED', extractAuditContext(req, 'user'), {
        documentId: doc.id,
        docType,
      })

      res.status(201).json({
        success: true,
        data: {
          documentId: doc.id,
          uploadUrl,
          objectKey,
          expiresAt,
          expiresInSeconds: STORAGE_TTL.UPLOAD_SECONDS,
        },
      })
    } catch (error) {
      next(error)
    }
  },
)

/**
 * GET /api/documents/:docId/download-url
 */
router.get(
  '/:docId/download-url',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = requireTenant(req)
      const { docId } = req.params
      if (!docId) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, 400, 'Document ID is required')
      }

      const store = getTenantDocumentVaultStore()
      const doc = await store.findById(docId, userId)
      if (!doc) {
        throw new AppError(ErrorCode.NOT_FOUND, 404, 'Document not found')
      }
      if (doc.uploadStatus !== 'confirmed' || !doc.storageKey) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, 400, 'Document upload not confirmed')
      }

      const { downloadUrl, expiresAt } = await generatePresignedDownload(doc.storageKey)

      auditLog('DOCUMENT_DOWNLOAD_URL_ISSUED', extractAuditContext(req, 'user'), {
        documentId: doc.id,
        docType: doc.docType,
      })

      res.json({
        success: true,
        data: {
          documentId: doc.id,
          downloadUrl,
          expiresAt,
          expiresInSeconds: STORAGE_TTL.DOWNLOAD_SECONDS,
        },
      })
    } catch (error) {
      next(error)
    }
  },
)

/**
 * PATCH /api/documents/:docId/confirm
 */
router.patch(
  '/:docId/confirm',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = requireTenant(req)
      const { docId } = req.params
      if (!docId) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, 400, 'Document ID is required')
      }

      const parsed = confirmUploadSchema.safeParse(req.body)
      if (!parsed.success) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, 400, 'Invalid confirmation payload')
      }

      const store = getTenantDocumentVaultStore()
      const pending = await store.findById(docId, userId)
      if (!pending) {
        throw new AppError(ErrorCode.NOT_FOUND, 404, 'Document not found')
      }
      if (pending.uploadStatus === 'confirmed') {
        throw new AppError(ErrorCode.VALIDATION_ERROR, 400, 'Document already confirmed')
      }
      if (pending.storageKey !== parsed.data.objectKey) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, 400, 'objectKey does not match pending upload')
      }

      const ext = contentTypeToExtension(pending.contentType ?? 'application/octet-stream')
      const fileName =
        parsed.data.fileName ??
        `${pending.docType ?? 'document'}.${ext}`

      const confirmed = await store.confirmUpload(docId, userId, {
        fileName,
        fileFormat: ext as import('../schemas/tenantDocumentVault.js').SupportedFileFormat,
        fileSizeBytes: parsed.data.fileSizeBytes ?? 1,
      })

      if (!confirmed) {
        throw new AppError(ErrorCode.NOT_FOUND, 404, 'Document not found')
      }

      auditLog('DOCUMENT_UPLOAD_CONFIRMED', extractAuditContext(req, 'user'), {
        documentId: docId,
        docType: confirmed.docType as DocumentDocType,
      })

      res.json({ success: true, data: confirmed })
    } catch (error) {
      next(error)
    }
  },
)

export function createTenantDocumentsPresignRouter(): Router {
  return router
}
