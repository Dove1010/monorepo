import { inspectionJobRepository } from '../repositories/InspectionJobRepository.js'
import { outboxStore } from '../outbox/store.js'
import { TxType } from '../outbox/types.js'
import { AppError } from '../errors/AppError.js'
import { ErrorCode } from '../errors/errorCodes.js'

export type InspectionJobStatus = 'available' | 'claimed' | 'in_progress' | 'submitted' | 'approved' | 'rejected'

const VALID_TRANSITIONS: Record<InspectionJobStatus, InspectionJobStatus[]> = {
  available: ['claimed'],
  claimed: ['in_progress', 'submitted', 'available'],
  in_progress: ['submitted', 'available'],
  submitted: ['approved', 'rejected'],
  approved: [],
  rejected: [],
}

export interface InspectionJob {
  id: string
  listingId: string
  inspectorId?: string
  status: InspectionJobStatus
  offeredFeeNgn: number
  claimDeadline?: Date
  submittedAt?: Date
  approvedAt?: Date
  rejectionReason?: string
  createdAt: Date
  updatedAt: Date
}

export interface InspectionReport {
  id: string
  jobId: string
  overallGrade: 'A' | 'B' | 'C' | 'D'
  roomChecklist: Record<string, unknown>
  photoKeys: string[]
  notes: string
  submittedAt: Date
}

export interface SubmitReportInput {
  overallGrade: 'A' | 'B' | 'C' | 'D'
  roomChecklist: Record<string, unknown>
  photoKeys: string[]
  notes: string
}

function assertValidTransition(from: InspectionJobStatus, to: InspectionJobStatus) {
  const allowed = VALID_TRANSITIONS[from]
  if (!allowed || !allowed.includes(to)) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      400,
      `Invalid status transition: ${from} → ${to}`,
    )
  }
}

export class InspectorService {
  async createJob(listingId: string, offeredFeeNgn: number): Promise<InspectionJob> {
    return inspectionJobRepository.create(listingId, offeredFeeNgn)
  }

  async claimJob(jobId: string, inspectorId: string): Promise<InspectionJob> {
    const job = await inspectionJobRepository.getById(jobId)
    if (!job) throw new AppError(ErrorCode.NOT_FOUND, 404, 'Inspection job not found')
    assertValidTransition(job.status, 'claimed')

    const claimed = await inspectionJobRepository.claim(jobId, inspectorId)
    if (!claimed) {
      throw new AppError(ErrorCode.CONFLICT, 409, 'Job was already claimed by another inspector')
    }
    return claimed
  }

  async submitReport(jobId: string, inspectorId: string, input: SubmitReportInput): Promise<{ job: InspectionJob; report: InspectionReport }> {
    const grade = input.overallGrade
    if (!['A', 'B', 'C', 'D'].includes(grade)) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 400, 'Grade must be one of A, B, C, D')
    }
    if (!input.photoKeys || input.photoKeys.length < 3) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 400, 'At least 3 photos are required')
    }
    if (!input.notes || input.notes.trim().length < 20) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 400, 'Notes must be at least 20 characters')
    }

    const job = await inspectionJobRepository.getById(jobId)
    if (!job) throw new AppError(ErrorCode.NOT_FOUND, 404, 'Inspection job not found')
    assertValidTransition(job.status, 'submitted')

    if (job.inspectorId !== inspectorId) {
      throw new AppError(ErrorCode.FORBIDDEN, 403, 'Only the assigned inspector can submit a report')
    }

    const report = await inspectionJobRepository.createReport({
      jobId,
      overallGrade: grade,
      roomChecklist: input.roomChecklist,
      photoKeys: input.photoKeys,
      notes: input.notes,
    })

    const updated = await inspectionJobRepository.submitReport(jobId, inspectorId, report.id)
    if (!updated) {
      throw new AppError(ErrorCode.INTERNAL_ERROR, 500, 'Failed to update job status after report submission')
    }

    return { job: updated, report }
  }

  async approveReport(jobId: string): Promise<InspectionJob> {
    const job = await inspectionJobRepository.getById(jobId)
    if (!job) throw new AppError(ErrorCode.NOT_FOUND, 404, 'Inspection job not found')
    assertValidTransition(job.status, 'approved')

    const approved = await inspectionJobRepository.approve(jobId)
    if (!approved) {
      throw new AppError(ErrorCode.CONFLICT, 409, 'Job could not be approved')
    }

    await outboxStore.create({
      txType: TxType.LANDLORD_PAYOUT,
      source: 'inspection',
      ref: `job-${jobId}`,
      payload: {
        jobId,
        listingId: approved.listingId,
        inspectorId: approved.inspectorId,
        amountNgn: approved.offeredFeeNgn,
        eventType: 'inspector_payout',
      },
    })

    return approved
  }

  async rejectReport(jobId: string, reason: string): Promise<InspectionJob> {
    const job = await inspectionJobRepository.getById(jobId)
    if (!job) throw new AppError(ErrorCode.NOT_FOUND, 404, 'Inspection job not found')
    assertValidTransition(job.status, 'rejected')

    const rejected = await inspectionJobRepository.reject(jobId, reason)
    if (!rejected) {
      throw new AppError(ErrorCode.CONFLICT, 409, 'Job could not be rejected')
    }

    return rejected
  }

  async listAvailableJobs(): Promise<InspectionJob[]> {
    return inspectionJobRepository.listAvailable()
  }

  async listAllJobs(): Promise<InspectionJob[]> {
    return inspectionJobRepository.listAll()
  }
}

export const inspectorService = new InspectorService()
