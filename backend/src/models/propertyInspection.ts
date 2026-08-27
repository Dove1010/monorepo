/**
 * Property Inspection model and types
 */

export enum InspectionStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  SUBMITTED = 'submitted',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export interface PropertyInspection {
  id: string
  listingId: string
  inspectorId: string
  status: InspectionStatus
  scheduledAt?: Date
  submittedAt?: Date
  approvedAt?: Date
  inspectorNotes?: string
  createdAt: Date
  updatedAt: Date
}

export interface CreatePropertyInspectionInput {
  listingId: string
  inspectorId: string
  scheduledAt?: Date
}

export interface UpdatePropertyInspectionInput {
  status?: InspectionStatus
  inspectorId?: string
  inspectorNotes?: string
}
