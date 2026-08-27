import { dataExportRepository, DataExportJob } from '../repositories/DataExportRepository.js'
import { logger } from '../utils/logger.js'

const EXPORT_EXPIRY_MS = 48 * 60 * 60 * 1000 // 48 hours
const PROCESSING_DELAY_MS = 2000

export class TenantDataExportService {
  /**
   * Create a new export job with status "pending" and kick off async processing.
   * The caller receives the job immediately (202 pattern); status transitions to
   * "ready" once processJob completes in the background.
   */
  async requestExport(userId: string): Promise<DataExportJob> {
    const job = await dataExportRepository.createJob(userId)

    // Fire-and-forget: simulate async ZIP generation without blocking the request.
    setTimeout(() => {
      this.processJob(job.id).catch((err) => {
        logger.error('tenantDataExport.processJob.failed', { jobId: job.id, userId, error: err })
      })
    }, PROCESSING_DELAY_MS)

    return job
  }

  /**
   * Return the current status of an export job, scoped to the requesting user.
   * Returns null when the job does not exist or belongs to a different user.
   */
  async getExportStatus(
    jobId: string,
    userId: string,
  ): Promise<{ status: DataExportJob['status']; downloadUrl?: string; expiresAt?: Date } | null> {
    const job = await dataExportRepository.getJobByIdForUser(jobId, userId)
    if (!job) return null

    return {
      status: job.status,
      downloadUrl: job.downloadUrl,
      expiresAt: job.expiresAt,
    }
  }

  /**
   * Simulate generating a tenant data ZIP and mark the job as ready.
   * In production this would collect PII records, write an encrypted archive to
   * object storage, and store a presigned URL here.
   */
  async processJob(jobId: string): Promise<void> {
    await dataExportRepository.updateJob(jobId, { status: 'processing' })

    // Simulate work (collect user data, build ZIP, upload to S3, etc.)
    const expiresAt = new Date(Date.now() + EXPORT_EXPIRY_MS)
    const signedExpiry = expiresAt.getTime()
    const downloadUrl = `https://s3.example.com/exports/${jobId}.zip?expires=${signedExpiry}`

    await dataExportRepository.updateJob(jobId, {
      status: 'ready',
      downloadUrl,
      expiresAt,
    })

    logger.info('tenantDataExport.job.ready', { jobId, expiresAt })
  }
}

export const tenantDataExportService = new TenantDataExportService()
