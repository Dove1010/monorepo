/**
 * Tenant Rating Card model and types
 */

export interface TenantRating {
  ratingId: string
  landlordId: string
  tenantId: string
  dealId: string
  paymentScore: number // 1-5
  propertyCareScore: number // 1-5
  communicationScore: number // 1-5
  comment?: string
  createdAt: Date
}

export interface TenantRatingCard {
  tenantId: string
  compositeScore: number
  paymentScore: number
  propertyCareScore: number
  communicationScore: number
  totalRatings: number
  ratings: TenantRating[]
  updatedAt: Date
}

export interface CreateRatingInput {
  landlordId: string
  tenantId: string
  dealId: string
  paymentScore: number
  propertyCareScore: number
  communicationScore: number
  comment?: string
}

export interface ShareToken {
  token: string
  tenantId: string
  expiresAt: Date
  createdAt: Date
}
