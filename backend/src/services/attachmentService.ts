import { randomUUID } from 'node:crypto'
import { AppError } from '../errors/AppError.js'
import { ErrorCode } from '../errors/errorCodes.js'
import type { StorageProvider } from './storageService.js'

const ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
])

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024
const UPLOAD_TTL_SECONDS = 15 * 60
const DOWNLOAD_TTL_SECONDS = 30 * 60

const FILE_SIGNATURES: Record<string, Uint8Array> = {
  'image/jpeg': new Uint8Array([0xFF, 0xD8, 0xFF]),
  'image/png': new Uint8Array([0x89, 0x50, 0x4E, 0x47]),
  'image/gif': new Uint8Array([0x47, 0x49, 0x46, 0x38]),
  'application/pdf': new Uint8Array([0x25, 0x50, 0x44, 0x46]),
}

export interface AttachmentUploadRequest {
  contentType: string
  fileSizeBytes: number
  fileName: string
}

export interface AttachmentUploadResponse {
  uploadUrl: string
  storageKey: string
  expiresAt: string
  expiresInSeconds: number
}

function validateContentType(contentType: string): void {
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      400,
      `Content type '${contentType}' not allowed. Accepted: ${[...ALLOWED_CONTENT_TYPES].join(', ')}`,
    )
  }
}

function validateFileSize(sizeBytes: number): void {
  if (sizeBytes > MAX_FILE_SIZE_BYTES) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      400,
      `File size ${sizeBytes} bytes exceeds the ${MAX_FILE_SIZE_BYTES} byte limit`,
    )
  }
}

export function validateFileSignature(buffer: Buffer, declaredType: string): boolean {
  const magic = FILE_SIGNATURES[declaredType]
  if (!magic) return true
  if (buffer.length < magic.length) return false
  for (let i = 0; i < magic.length; i++) {
    if (buffer[i] !== magic[i]) return false
  }
  return true
}

export async function requestAttachmentUploadUrl(
  storageProvider: StorageProvider,
  request: AttachmentUploadRequest,
): Promise<AttachmentUploadResponse> {
  validateContentType(request.contentType)
  validateFileSize(request.fileSizeBytes)

  const safeName = request.fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
  const storageKey = `message-attachments/${randomUUID()}-${safeName}`

  const { uploadUrl, objectKey } = await storageProvider.generatePresignedUpload(
    storageKey,
    request.contentType,
    UPLOAD_TTL_SECONDS,
  )

  const expiresAt = new Date(Date.now() + UPLOAD_TTL_SECONDS * 1000).toISOString()

  return {
    uploadUrl,
    storageKey: objectKey,
    expiresAt,
    expiresInSeconds: UPLOAD_TTL_SECONDS,
  }
}

export async function getAttachmentDownloadUrl(
  storageProvider: StorageProvider,
  storageKey: string,
): Promise<{ downloadUrl: string; expiresAt: string }> {
  const { downloadUrl } = await storageProvider.generatePresignedDownload(storageKey, DOWNLOAD_TTL_SECONDS)
  const expiresAt = new Date(Date.now() + DOWNLOAD_TTL_SECONDS * 1000).toISOString()
  return { downloadUrl, expiresAt }
}

export async function stripImageExif(buffer: Buffer): Promise<Buffer> {
  try {
    const { exiftool } = await import('exiftool-vendored')
    const { writeFile, readFile, unlink } = await import('node:fs/promises')
    const tmpPath = `/tmp/exif_${randomUUID()}`
    await writeFile(tmpPath, buffer)
    try {
      await exiftool.deleteAllTags(tmpPath)
      return await readFile(tmpPath)
    } finally {
      await unlink(tmpPath).catch(() => {})
    }
  } catch {
    try {
      const { execSync } = await import('node:child_process')
      execSync('which exiftool', { stdio: 'ignore' })
      const { writeFile, readFile, unlink } = await import('node:fs/promises')
      const tmpPath = `/tmp/exif_${randomUUID()}`
      await writeFile(tmpPath, buffer)
      execSync(`exiftool -all= -overwrite_original "${tmpPath}"`, { stdio: 'ignore' })
      const cleaned = await readFile(tmpPath)
      await unlink(tmpPath).catch(() => {})
      return cleaned
    } catch {
      return buffer
    }
  }
}

export { ALLOWED_CONTENT_TYPES, MAX_FILE_SIZE_BYTES, UPLOAD_TTL_SECONDS, DOWNLOAD_TTL_SECONDS }
