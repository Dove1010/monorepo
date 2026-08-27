/**
 * Lease Agreement model and types
 */

export enum LeaseStatus {
  DRAFT = 'draft',
  PENDING_TENANT_SIGNATURE = 'pending_tenant_signature',
  PENDING_LANDLORD_SIGNATURE = 'pending_landlord_signature',
  FULLY_SIGNED = 'fully_signed',
  VOIDED = 'voided',
}

export interface LeaseAgreement {
  leaseId: string
  dealId: string
  documentKey: string
  status: LeaseStatus
  tenantSignedAt?: Date
  landlordSignedAt?: Date
  tenantSignatureRef?: string
  landlordSignatureRef?: string
  createdAt: Date
  updatedAt: Date
}

export interface CreateLeaseInput {
  dealId: string
  documentKey: string
}
