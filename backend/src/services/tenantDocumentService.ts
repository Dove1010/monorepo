import { fileTypeFromBuffer } from 'file-type'
import { randomUUID } from 'node:crypto'
import { AppError } from '../errors/AppError.js'
import { ErrorCode } from '../errors/errorCodes.js'
import {
  uploadFile,
  deleteFile,
  generatePresignedDownload,
} from './storageService.js'
import { tenantDocumentRepository } from '../repositories/TenantDocumentRepository.js'
import type { DocumentCategory, TenantDocumentResponse } from '../schemas/tenantDocument.js'

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20 MB
const STORAGE_QUOTA = 500 * 1024 * 1024 // 500 MB
const DOWNLOAD_TTL_SECONDS = 15 * 60 // 15 minutes

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
])

const MIME_TO_EXTENSION: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
}

export class TenantDocumentService {
  async uploadDocument(
    userId: string,
    fileBuffer: Buffer,
    fileName: string,
    category: DocumentCategory,
    description?: string,
    dealId?: string,
  ): Promise<TenantDocumentResponse> {
    // Validate file size
    if (fileBuffer.length > MAX_FILE_SIZE) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        400,
        `File size exceeds 20 MB limit. Your file is ${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB.`,
      )
    }

    // Validate MIME type
    const fileType = await fileTypeFromBuffer(fileBuffer)
    if (!fileType || !ALLOWED_MIME_TYPES.has(fileType.mime)) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        400,
        'Invalid file type. Only PDF, JPG, and PNG files are allowed.',
      )
    }

    // Check storage quota
    const usedBytes = await tenantDocumentRepository.getTotalStorageBytes(userId)
    if (usedBytes + fileBuffer.length > STORAGE_QUOTA) {
      const remainingBytes = STORAGE_QUOTA - usedBytes
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        400,
        `Storage quota exceeded. You have ${(remainingBytes / 1024 / 1024).toFixed(2)} MB remaining.`,
      )
    }

    // Upload to S3
    const extension = MIME_TO_EXTENSION[fileType.mime]
    const objectKey = `tenant-documents/${userId}/${category}/${randomUUID()}.${extension}`

    await uploadFile(objectKey, fileBuffer, fileType.mime)

    // Create DB record
    const doc = await tenantDocumentRepository.create(userId, {
      fileName,
      fileFormat: extension,
      fileSizeBytes: fileBuffer.length,
      storageKey: objectKey,
      category,
      description,
      dealId,
    })

    return doc
  }

  async deleteDocument(id: string, userId: string): Promise<void> {
    // Delete from DB first to get the storageKey, then delete from S3
    const result = await tenantDocumentRepository.delete(id, userId)
    if (!result.deleted) {
      throw new AppError(ErrorCode.NOT_FOUND, 404, 'Document not found')
    }

    if (result.storageKey) {
      try {
        await deleteFile(result.storageKey)
      } catch (error) {
        // Log but don't fail if S3 deletion fails
        console.error('Failed to delete from S3:', result.storageKey, error)
      }
    }
  }

  async getDownloadUrl(id: string, userId: string): Promise<string> {
    const storageKey = await tenantDocumentRepository.getStorageKey(id, userId)
    if (!storageKey) {
      throw new AppError(ErrorCode.NOT_FOUND, 404, 'Document not found')
    }

    // Get signed download URL from storage service
    const { downloadUrl } = await generatePresignedDownload(storageKey, DOWNLOAD_TTL_SECONDS)

    return downloadUrl
  }

  async addLandlordLeaseToVault(
    tenantId: string,
    dealId: string,
    storageKey: string,
    fileName: string,
    fileSizeBytes: number,
  ): Promise<TenantDocumentResponse> {
    // Create a read-only, landlord-uploaded document
    return tenantDocumentRepository.create(tenantId, {
      fileName,
      fileFormat: 'pdf',
      fileSizeBytes,
      storageKey,
      category: 'lease_agreement',
      dealId,
      isLandlordUploaded: true,
      readOnly: true,
    })
  }
}

export const tenantDocumentService = new TenantDocumentService()
