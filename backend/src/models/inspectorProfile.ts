/**
 * Inspector Profile model and types
 */

export enum InspectorVerificationStatus {
  PENDING = 'pending',
  VERIFIED = 'verified',
  SUSPENDED = 'suspended',
}

export interface InspectorProfile {
  userId: string
  verificationStatus: InspectorVerificationStatus
  bio?: string
  serviceAreas: string[]
  completedInspections: number
  createdAt: Date
  updatedAt: Date
}

export interface CreateInspectorProfileInput {
  userId: string
  bio?: string
  serviceAreas: string[]
}

export interface UpdateInspectorProfileInput {
  bio?: string
  serviceAreas?: string[]
}
