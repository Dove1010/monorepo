import { propertyInspectionStore } from '../models/propertyInspectionStore.js'
import { inspectionChecklistItemStore } from '../models/inspectionChecklistItemStore.js'
import { inspectionPhotoStore } from '../models/inspectionPhotoStore.js'
import { inspectorProfileStore } from '../models/inspectorProfileStore.js'
import { listingStore } from '../models/listingStore.js'
import { InspectionStatus } from '../models/propertyInspection.js'
import { ChecklistCategory, ChecklistResult } from '../models/inspectionChecklistItem.js'
import { InspectorVerificationStatus } from '../models/inspectorProfile.js'
import { AppError } from '../errors/AppError.js'
import { ErrorCode } from '../errors/errorCodes.js'

const VALID_TRANSITIONS: Record<InspectionStatus, InspectionStatus[]> = {
  [InspectionStatus.PENDING]: [InspectionStatus.IN_PROGRESS],
  [InspectionStatus.IN_PROGRESS]: [InspectionStatus.SUBMITTED],
  [InspectionStatus.SUBMITTED]: [InspectionStatus.APPROVED, InspectionStatus.REJECTED],
  [InspectionStatus.APPROVED]: [],
  [InspectionStatus.REJECTED]: [],
}

function assertValidTransition(from: InspectionStatus, to: InspectionStatus) {
  const allowed = VALID_TRANSITIONS[from]
  if (!allowed || !allowed.includes(to)) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      400,
      `Invalid status transition: ${from} → ${to}`,
    )
  }
}

export interface InspectionJob {
  id: string
  listingId: string
  address?: string
  status: InspectionStatus
  scheduledAt?: Date
}

export interface InspectorEarnings {
  inspectorId: string
  completedInspections: number
  totalEarnings: number
  inspections: Array<{
    id: string
    listingId: string
    completedAt: Date
    fee: number
  }>
}

export interface InspectionSummary {
  inspectionId: string
  listingId: string
  approvedAt: Date
  categoryResults: Record<ChecklistCategory, { pass: number; fail: number; na: number }>
  totalItems: number
  passCount: number
  failCount: number
  photoCount: number
}

export class PropertyInspectionService {
  async getAvailableJobs(serviceAreas: string[]): Promise<InspectionJob[]> {
    const pendingInspections = await propertyInspectionStore.list({
      status: InspectionStatus.PENDING,
    })

    const jobs: InspectionJob[] = []
    for (const inspection of pendingInspections) {
      const listing = await listingStore.getById(inspection.listingId)
      if (!listing) continue

      const areaMatch = serviceAreas.some((area) =>
        listing.area?.toLowerCase().includes(area.toLowerCase()) ||
        listing.city?.toLowerCase().includes(area.toLowerCase()) ||
        listing.address.toLowerCase().includes(area.toLowerCase()),
      )

      if (areaMatch) {
        jobs.push({
          id: inspection.id,
          listingId: inspection.listingId,
          address: listing.address,
          status: inspection.status,
          scheduledAt: inspection.scheduledAt,
        })
      }
    }

    return jobs
  }

  async acceptJob(inspectionId: string, inspectorId: string, serviceAreas: string[]): Promise<any> {
    const inspection = await propertyInspectionStore.getById(inspectionId)
    if (!inspection) {
      throw new AppError(ErrorCode.NOT_FOUND, 404, 'Inspection not found')
    }

    if (inspection.inspectorId && inspection.inspectorId !== inspectorId) {
      throw new AppError(ErrorCode.CONFLICT, 409, 'Inspection already assigned to another inspector')
    }

    const listing = await listingStore.getById(inspection.listingId)
    if (!listing) {
      throw new AppError(ErrorCode.NOT_FOUND, 404, 'Listing not found')
    }

    const areaMatch = serviceAreas.some((area) =>
      listing.area?.toLowerCase().includes(area.toLowerCase()) ||
      listing.city?.toLowerCase().includes(area.toLowerCase()) ||
      listing.address.toLowerCase().includes(area.toLowerCase()),
    )

    if (!areaMatch) {
      throw new AppError(ErrorCode.FORBIDDEN, 403, 'Inspection is not in your service area')
    }

    assertValidTransition(inspection.status, InspectionStatus.IN_PROGRESS)

    const updated = await propertyInspectionStore.update(inspectionId, {
      status: InspectionStatus.IN_PROGRESS,
      inspectorId,
    })

    return updated
  }

  async submitReport(inspectionId: string, inspectorId: string, input: any): Promise<any> {
    const inspection = await propertyInspectionStore.getById(inspectionId)
    if (!inspection) {
      throw new AppError(ErrorCode.NOT_FOUND, 404, 'Inspection not found')
    }

    if (inspection.inspectorId !== inspectorId) {
      throw new AppError(ErrorCode.FORBIDDEN, 403, 'You can only submit reports for your assigned inspections')
    }

    assertValidTransition(inspection.status, InspectionStatus.SUBMITTED)

    if (!input.checklistItems || input.checklistItems.length === 0) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 400, 'At least one checklist item is required')
    }

    if (!input.photos || input.photos.length === 0) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 400, 'At least one photo is required')
    }

    if (!input.inspectorNotes || input.inspectorNotes.trim().length < 10) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 400, 'Inspector notes must be at least 10 characters')
    }

    for (const item of input.checklistItems) {
      await inspectionChecklistItemStore.create({
        inspectionId,
        category: item.category,
        item: item.item,
        result: item.result,
        notes: item.notes,
      })
    }

    for (const photo of input.photos) {
      await inspectionPhotoStore.create({
        inspectionId,
        url: photo.url,
        caption: photo.caption,
      })
    }

    const updated = await propertyInspectionStore.update(inspectionId, {
      status: InspectionStatus.SUBMITTED,
      inspectorNotes: input.inspectorNotes,
    })

    return updated
  }

  async reviewInspection(inspectionId: string, status: 'approved' | 'rejected', rejectionReason?: string): Promise<any> {
    const inspection = await propertyInspectionStore.getById(inspectionId)
    if (!inspection) {
      throw new AppError(ErrorCode.NOT_FOUND, 404, 'Inspection not found')
    }

    const targetStatus = status === 'approved' ? InspectionStatus.APPROVED : InspectionStatus.REJECTED
    assertValidTransition(inspection.status, targetStatus)

    const updated = await propertyInspectionStore.updateStatus(inspectionId, targetStatus)

    if (status === 'approved') {
      await this.updateListingTrustScore(inspection.listingId)
      await inspectorProfileStore.incrementCompletedInspections(inspection.inspectorId)
    }

    return updated
  }

  async getInspectorEarnings(inspectorId: string): Promise<InspectorEarnings> {
    const profile = await inspectorProfileStore.getByUserId(inspectorId)
    if (!profile) {
      throw new AppError(ErrorCode.NOT_FOUND, 404, 'Inspector profile not found')
    }

    const inspections = await propertyInspectionStore.list({
      inspectorId,
      status: InspectionStatus.APPROVED,
    })

    const earnings: InspectorEarnings = {
      inspectorId,
      completedInspections: profile.completedInspections,
      totalEarnings: inspections.length * 5000, // Default fee - should be configurable
      inspections: inspections.map((insp) => ({
        id: insp.id,
        listingId: insp.listingId,
        completedAt: insp.approvedAt!,
        fee: 5000, // Default fee
      })),
    }

    return earnings
  }

  async getInspectionSummary(propertyId: string): Promise<InspectionSummary | null> {
    const listing = await listingStore.getById(propertyId)
    if (!listing) {
      throw new AppError(ErrorCode.NOT_FOUND, 404, 'Listing not found')
    }

    const inspections = await propertyInspectionStore.getByListingId(propertyId)
    const approved = inspections.find((i) => i.status === InspectionStatus.APPROVED)

    if (!approved) {
      return null
    }

    const checklistItems = await inspectionChecklistItemStore.getByInspectionId(approved.id)
    const photos = await inspectionPhotoStore.getByInspectionId(approved.id)

    const categoryResults: Record<ChecklistCategory, { pass: number; fail: number; na: number }> = {
      [ChecklistCategory.STRUCTURAL]: { pass: 0, fail: 0, na: 0 },
      [ChecklistCategory.PLUMBING]: { pass: 0, fail: 0, na: 0 },
      [ChecklistCategory.ELECTRICAL]: { pass: 0, fail: 0, na: 0 },
      [ChecklistCategory.SAFETY]: { pass: 0, fail: 0, na: 0 },
      [ChecklistCategory.EXTERIOR]: { pass: 0, fail: 0, na: 0 },
    }

    let passCount = 0
    let failCount = 0

    for (const item of checklistItems) {
      const category = item.category as ChecklistCategory
      if (categoryResults[category]) {
        if (item.result === ChecklistResult.PASS) {
          categoryResults[category].pass++
          passCount++
        } else if (item.result === ChecklistResult.FAIL) {
          categoryResults[category].fail++
          failCount++
        } else {
          categoryResults[category].na++
        }
      }
    }

    const summary: InspectionSummary = {
      inspectionId: approved.id,
      listingId: approved.listingId,
      approvedAt: approved.approvedAt!,
      categoryResults,
      totalItems: checklistItems.length,
      passCount,
      failCount,
      photoCount: photos.length,
    }

    return summary
  }

  private async updateListingTrustScore(listingId: string): Promise<void> {
    const listing = await listingStore.getById(listingId)
    if (!listing) return

    const currentTrustScore = listing.trustScore || 50
    const newTrustScore = Math.min(100, currentTrustScore + 20)

    await listingStore.updateTrustScore(listingId, newTrustScore, true)
  }
}

export const propertyInspectionService = new PropertyInspectionService()
