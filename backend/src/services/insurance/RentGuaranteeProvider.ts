export interface InsuranceQuote {
  premiumAmountNgn: number
  coverageTermMonths: number
  coverageDetails: Record<string, unknown>
  quoteId: string
}

export interface InsurancePolicy {
  policyNumber: string
  dealId: string
  landlordId: string
  provider: string
  premiumNgn: number
  coverageTermMonths: number
  status: 'quoted' | 'active' | 'cancelled' | 'claimed'
  createdAt: Date
}

export interface ClaimResult {
  claimId: string
  policyNumber: string
  status: string
  details: Record<string, unknown>
}

export interface RentGuaranteeProvider {
  getQuote(dealId: string, coverageTermMonths: number): Promise<InsuranceQuote>
  purchasePolicy(dealId: string, landlordId: string, quoteId: string): Promise<InsurancePolicy>
  cancelPolicy(policyId: string, reason: string): Promise<void>
  fileClaim(policyId: string, claimData: Record<string, unknown>): Promise<ClaimResult>
}
