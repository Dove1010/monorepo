import { randomUUID } from 'node:crypto'
import type { RentGuaranteeProvider, InsuranceQuote, InsurancePolicy, ClaimResult } from './RentGuaranteeProvider.js'

export class MockRentGuaranteeProvider implements RentGuaranteeProvider {
  private policies = new Map<string, InsurancePolicy>()

  async getQuote(dealId: string, coverageTermMonths: number): Promise<InsuranceQuote> {
    const basePremiumRate = 0.03
    const premiumAmountNgn = Math.round(1_200_000 * (basePremiumRate * coverageTermMonths / 12))

    return {
      quoteId: `mock-quote-${randomUUID().slice(0, 8)}`,
      premiumAmountNgn,
      coverageTermMonths,
      coverageDetails: {
        provider: 'mock',
        coverageType: 'rent_guarantee',
        maxCoverageNgn: 1_200_000,
        deductibleNgn: 0,
        waitingPeriodDays: 30,
        terms: 'Covers up to 12 months of unpaid rent',
      },
    }
  }

  async purchasePolicy(dealId: string, landlordId: string, quoteId: string): Promise<InsurancePolicy> {
    const now = new Date()
    const policy: InsurancePolicy = {
      policyNumber: `MOCK-POL-${randomUUID().slice(0, 12).toUpperCase()}`,
      dealId,
      landlordId,
      provider: 'mock',
      premiumNgn: 30_000,
      coverageTermMonths: 12,
      status: 'active',
      createdAt: now,
    }

    this.policies.set(policy.policyNumber, policy)
    return policy
  }

  async cancelPolicy(policyId: string, reason: string): Promise<void> {
    const policy = this.policies.get(policyId)
    if (policy) {
      policy.status = 'cancelled'
      this.policies.set(policyId, policy)
    }
  }

  async fileClaim(policyId: string, claimData: Record<string, unknown>): Promise<ClaimResult> {
    return {
      claimId: `mock-claim-${randomUUID().slice(0, 8)}`,
      policyNumber: policyId,
      status: 'submitted',
      details: {
        provider: 'mock',
        claimData,
        submittedAt: new Date().toISOString(),
        estimatedProcessingDays: 14,
      },
    }
  }
}
