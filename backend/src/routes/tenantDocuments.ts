import { Router, type Request, type Response, type NextFunction } from 'express'
import multer from 'multer'
import { authenticateToken } from '../middleware/auth.js'
import { AppError } from '../errors/AppError.js'
import { ErrorCode } from '../errors/errorCodes.js'
import { uploadBodySchema, listQuerySchema } from '../schemas/tenantDocument.js'
import { tenantDocumentService } from '../services/tenantDocumentService.js'
import { tenantDocumentRepository } from '../repositories/TenantDocumentRepository.js'
import { auditLog, extractAuditContext } from '../utils/auditLogger.js'

const router = Router()

const multerUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024, // 20 MB
  },
})

function requireTenant(req: Request): string {
  const user = (req as any).user
  if (!user?.id) {
    throw new AppError(ErrorCode.UNAUTHORIZED, 401, 'User not authenticated')
  }
  return user.id as string
}

/**
 * POST /api/v1/tenant/documents
 * Upload a document with multipart form data
 */
router.post(
  '/',
  authenticateToken,
  multerUpload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = requireTenant(req)

      if (!req.file) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, 400, 'No file provided')
      }

      const bodyParsed = uploadBodySchema.safeParse(req.body)
      if (!bodyParsed.success) {
        throw new AppError(
          ErrorCode.VALIDATION_ERROR,
          400,
          'Invalid request: ' + bodyParsed.error.issues.map((i) => i.message).join(', '),
        )
      }

      const { category, description, dealId } = bodyParsed.data
      const doc = await tenantDocumentService.uploadDocument(
        userId,
        req.file.buffer,
        req.file.originalname,
        category,
        description,
        dealId,
      )

      auditLog('DOCUMENT_UPLOADED', extractAuditContext(req, 'user'), {
        documentId: doc.id,
        category: doc.category,
        fileSize: doc.fileSizeBytes,
      })

      res.status(201).json({
        success: true,
        data: doc,
      })
    } catch (error) {
      next(error)
    }
  },
)

/**
 * GET /api/v1/tenant/documents
 * List documents with optional filters
 */
router.get('/', authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = requireTenant(req)

    const queryParsed = listQuerySchema.safeParse(req.query)
    if (!queryParsed.success) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        400,
        'Invalid query parameters: ' + queryParsed.error.issues.map((i) => i.message).join(', '),
      )
    }

    const { category, dealId, page, pageSize } = queryParsed.data
    const result = await tenantDocumentRepository.list(userId, {
      category,
      dealId,
      page,
      pageSize,
    })

    auditLog('DOCUMENT_LISTED', extractAuditContext(req, 'user'), {
      resultCount: result.documents.length,
      category,
    })

    res.json({
      success: true,
      data: result.documents,
      pagination: {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / result.pageSize),
      },
    })
  } catch (error) {
    next(error)
  }
})

/**
 * GET /api/v1/tenant/documents/:id/download
 * Get a presigned download URL for a document
 */
router.get('/:id/download', authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = requireTenant(req)
    const { id } = req.params

    if (!id) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 400, 'Document ID is required')
    }

    const downloadUrl = await tenantDocumentService.getDownloadUrl(id, userId)

    auditLog('DOCUMENT_DOWNLOAD_URL_ISSUED', extractAuditContext(req, 'user'), {
      documentId: id,
    })

    res.json({
      success: true,
      data: {
        documentId: id,
        downloadUrl,
        expiresInSeconds: 15 * 60, // 15 minutes
      },
    })
  } catch (error) {
    next(error)
  }
})

/**
 * DELETE /api/v1/tenant/documents/:id
 * Delete a document
 */
router.delete('/:id', authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = requireTenant(req)
    const { id } = req.params

    if (!id) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 400, 'Document ID is required')
    }

    await tenantDocumentService.deleteDocument(id, userId)

    auditLog('DOCUMENT_DELETED', extractAuditContext(req, 'user'), {
      documentId: id,
    })

    res.json({ success: true })
  } catch (error) {
    next(error)
  }
})

export function createTenantDocumentsRouter(): Router {
  return router
}
