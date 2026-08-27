import { randomUUID } from 'node:crypto'

export type DataExportJobStatus = 'pending' | 'processing' | 'ready' | 'expired'

export interface DataExportJob {
  id: string
  userId: string
  status: DataExportJobStatus
  downloadUrl?: string
  expiresAt?: Date
  createdAt: Date
  updatedAt: Date
}

export class DataExportRepository {
  private readonly store = new Map<string, DataExportJob>()

  async createJob(userId: string): Promise<DataExportJob> {
    const now = new Date()
    const job: DataExportJob = {
      id: randomUUID(),
      userId,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    }
    this.store.set(job.id, job)
    return { ...job }
  }

  async getJob(jobId: string): Promise<DataExportJob | null> {
    const job = this.store.get(jobId)
    return job ? { ...job } : null
  }

  async getJobByIdForUser(jobId: string, userId: string): Promise<DataExportJob | null> {
    const job = this.store.get(jobId)
    if (!job || job.userId !== userId) return null
    return { ...job }
  }

  async updateJob(jobId: string, updates: Partial<DataExportJob>): Promise<DataExportJob> {
    const job = this.store.get(jobId)
    if (!job) {
      throw new Error(`DataExportJob not found: ${jobId}`)
    }
    const updated: DataExportJob = { ...job, ...updates, updatedAt: new Date() }
    this.store.set(jobId, updated)
    return { ...updated }
  }

  /**
   * Mark all jobs whose expiresAt is in the past as expired.
   * Intended to be called periodically by a background scheduler.
   */
  async markExpiredJobs(): Promise<void> {
    const now = new Date()
    for (const job of this.store.values()) {
      if (job.status === 'ready' && job.expiresAt && job.expiresAt < now) {
        const updated: DataExportJob = { ...job, status: 'expired', updatedAt: new Date() }
        this.store.set(job.id, updated)
      }
    }
  }
}

export const dataExportRepository = new DataExportRepository()
