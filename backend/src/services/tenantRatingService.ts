import { tenantRatingRepository, TenantRating, RatingAggregate, RatingCardToken } from '../repositories/TenantRatingRepository.js'
import { AppError } from '../errors/AppError.js'
import { ErrorCode } from '../errors/errorCodes.js'
import { logger } from '../utils/logger.js'
import { TenantReputationOnChainService } from './tenantReputationOnChainService.js'

export interface SubmitRatingInput {
  paymentTimeliness: number
  propertyCare: number
  communication: number
  overall: number
  comment?: string
}

export class TenantRatingService {
  private onChainService?: TenantReputationOnChainService

  setOnChainService(svc: TenantReputationOnChainService): void {
    this.onChainService = svc
  }

  async submitRating(
    landlordId: string,
    tenantId: string,
    dealId: string,
    input: SubmitRatingInput,
  ): Promise<TenantRating> {
    this.validateRatingInput(input)

    const already = await tenantRatingRepository.hasRatedDeal(landlordId, dealId)
    if (already) {
      throw new AppError(ErrorCode.DUPLICATE_REQUEST, 409, 'You have already rated this tenant for this deal')
    }

    const rating = await tenantRatingRepository.create({
      tenantId,
      landlordId,
      dealId,
      paymentTimeliness: input.paymentTimeliness,
      propertyCare: input.propertyCare,
      communication: input.communication,
      overall: input.overall,
      comment: input.comment,
    })

    this.anchorReputationAsync(tenantId, rating.id)

    return rating
  }

  private anchorReputationAsync(tenantId: string, ratingId: string): void {
    if (!this.onChainService) return

    const svc = this.onChainService
    tenantRatingRepository
      .getAggregate(tenantId)
      .then((aggregate) => {
        if (!aggregate) return
        return svc.enqueueReputationUpdate(tenantId, aggregate, ratingId)
      })
      .catch((err) => {
        logger.error('Failed to enqueue on-chain reputation update', {
          tenantId,
          ratingId,
          error: err instanceof Error ? err.message : String(err),
        })
      })
  }

  async getCard(tenantId: string): Promise<{
    ratings: TenantRating[]
    aggregate: RatingAggregate | null
  }> {
    const [ratings, aggregate] = await Promise.all([
      tenantRatingRepository.findByTenantId(tenantId),
      tenantRatingRepository.getAggregate(tenantId),
    ])

    return { ratings, aggregate }
  }

  async getCardByToken(token: string): Promise<{
    ratings: Omit<TenantRating, 'tenantId' | 'landlordId'>[]
    aggregate: RatingAggregate | null
  } | null> {
    const tokenData = await tenantRatingRepository.getTokenData(token)
    if (!tokenData) return null

    if (new Date() > tokenData.expiresAt) return null

    const { ratings, aggregate } = await this.getCard(tokenData.tenantId)

    return {
      ratings: ratings.map((r) => ({
        id: r.id,
        dealId: r.dealId,
        paymentTimeliness: r.paymentTimeliness,
        propertyCare: r.propertyCare,
        communication: r.communication,
        overall: r.overall,
        comment: r.comment,
        createdAt: r.createdAt,
      })),
      aggregate,
    }
  }

  async generateShareToken(tenantId: string): Promise<RatingCardToken> {
    return tenantRatingRepository.createShareToken(tenantId, 72)
  }

  private validateRatingInput(input: SubmitRatingInput): void {
    const dimensions: Array<keyof SubmitRatingInput> = ['paymentTimeliness', 'propertyCare', 'communication', 'overall']
    for (const dim of dimensions) {
      const val = input[dim]
      if (typeof val !== 'number' || !Number.isInteger(val) || val < 1 || val > 5) {
        throw new AppError(
          ErrorCode.VALIDATION_ERROR,
          400,
          `${dim} must be an integer between 1 and 5`,
        )
      }
    }

    if (input.comment && input.comment.length > 500) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        400,
        'Comment must not exceed 500 characters',
      )
    }
  }
}

export const tenantRatingService = new TenantRatingService()
