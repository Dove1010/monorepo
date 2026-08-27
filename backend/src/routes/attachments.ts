import { nanoid } from 'nanoid'
import { Router, type Request, type Response, type NextFunction } from 'express'
import { authenticateToken, type AuthenticatedRequest } from '../middleware/auth.js'
import { AppError, notFound, unauthorized } from '../errors/AppError.js'
import { ErrorCode } from '../errors/errorCodes.js'
import { conversationStore } from '../models/conversationStore.js'
import {
  requestAttachmentUploadUrl,
  getAttachmentDownloadUrl,
  validateFileSignature,
  stripImageExif,
  ALLOWED_CONTENT_TYPES,
  MAX_FILE_SIZE_BYTES,
} from '../services/attachmentService.js'
import { STORAGE_PROVIDER, type StorageProvider } from '../services/storageService.js'
import { z } from 'zod'
import multer from 'multer'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_CONTENT_TYPES.has(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new AppError(ErrorCode.VALIDATION_ERROR, 400, `Content type ${file.mimetype} not allowed`))
    }
  },
})

const uploadUrlSchema = z.object({
  contentType: z.string().min(1),
  fileSizeBytes: z.number().int().positive(),
  fileName: z.string().min(1).max(255),
})

function requireUser(req: AuthenticatedRequest): string {
  const userId = req.user?.id
  if (!userId) throw unauthorized()
  return userId
}

export function createAttachmentsRouter(storageProvider?: StorageProvider): Router {
  const router = Router()

  const provider: StorageProvider = storageProvider ?? {
    async generatePresignedUpload(key: string, contentType: string, ttlSeconds: number) {
      return { uploadUrl: `/api/v1/messaging/attachments/upload/${key}`, objectKey: key }
    },
    async generatePresignedDownload(key: string, ttlSeconds: number) {
      return { downloadUrl: `/api/v1/messaging/attachments/download/${key}` }
    },
    async uploadFile(key: string, buffer: Buffer, contentType: string) {
      return { key, url: '' }
    },
    async deleteFile(key: string) {},
    async copyFile(sourceKey: string, destKey: string) {},
  }

  router.post('/upload-url', authenticateToken, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireUser(req)
      const parsed = uploadUrlSchema.safeParse(req.body)
      if (!parsed.success) {
        throw new AppError(
          ErrorCode.VALIDATION_ERROR,
          400,
          parsed.error.issues.map(i => i.message).join(', '),
        )
      }
      const result = await requestAttachmentUploadUrl(provider, parsed.data)
      res.status(201).json({ success: true, data: result })
    } catch (error) {
      next(error)
    }
  })

  router.post('/validate', authenticateToken, upload.single('file'), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireUser(req)
      if (!req.file) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, 400, 'No file provided')
      }

      const declaredType = req.body.contentType || req.file.mimetype

      if (!ALLOWED_CONTENT_TYPES.has(declaredType)) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, 400, `Content type ${declaredType} not allowed`)
      }

      if (req.file.size > MAX_FILE_SIZE_BYTES) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, 400, 'File too large')
      }

      if (!validateFileSignature(req.file.buffer, declaredType)) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, 400, 'File signature does not match declared type')
      }

      let processedBuffer = req.file.buffer
      if (declaredType.startsWith('image/')) {
        processedBuffer = await stripImageExif(processedBuffer)
      }

      const safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')
      const storageKey = `message-attachments/${nanoid()}-${safeName}`
      await provider.uploadFile(storageKey, processedBuffer, declaredType)

      const fileType: 'image' | 'document' = declaredType.startsWith('image/') ? 'image' : 'document'
      const downloadUrl = (await provider.generatePresignedDownload(storageKey, 1800)).downloadUrl

      res.json({
        success: true,
        data: {
          storageKey,
          contentType: declaredType,
          sizeBytes: req.file.size,
          type: fileType,
          name: req.file.originalname,
          url: downloadUrl,
        },
      })
    } catch (error) {
      next(error)
    }
  })

  router.get('/download/:storageKey(*)', authenticateToken, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = requireUser(req)
      const storageKey = req.params.storageKey
      const conversationId = req.query.conversationId as string | undefined

      if (conversationId) {
        const isParticipant = await conversationStore.isParticipant(conversationId, userId)
        if (!isParticipant) {
          throw notFound('Attachment')
        }
      }

      const { downloadUrl, expiresAt } = await getAttachmentDownloadUrl(provider, storageKey)
      res.json({
        success: true,
        data: { downloadUrl, expiresAt, expiresInSeconds: 1800 },
      })
    } catch (error) {
      next(error)
    }
  })

  return router
}
