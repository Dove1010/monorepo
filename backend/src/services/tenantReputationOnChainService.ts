import { RatingAggregate } from '../repositories/TenantRatingRepository.js'
import { outboxStore } from '../outbox/store.js'
import { TxType } from '../outbox/types.js'
import { SorobanAdapter, TenantReputationRecord } from '../soroban/adapter.js'
import { logger } from '../utils/logger.js'

/**
 * Score mapping: off-chain 1–5 avg → on-chain 0–1000 scale.
 *
 * Contract fields       ← Off-chain field          Formula
 * composite_score       ← overallAvg               round(avg × 200)
 * payment_score         ← paymentTimelinessAvg     round(avg × 200)
 * property_care_score   ← propertyCareAvg          round(avg × 200)
 * communication_score   ← communicationAvg         round(avg × 200)
 *
 * Rationale: 5.0 × 200 = 1000 (contract max), 1.0 × 200 = 200 (practical min).
 */
function toOnChainScore(avg: number): number {
  return Math.round(avg * 200)
}

/**
 * Anchors a tenant's off-chain aggregate reputation on-chain via the
 * tenant_reputation Soroban contract.
 *
 * Write path: enqueueReputationUpdate → outbox → OutboxSender → adapter.updateTenantReputation
 * Read path:  getReputation → adapter.getTenantReputation
 */
export class TenantReputationOnChainService {
  constructor(private readonly adapter: SorobanAdapter) {}

  /**
   * Enqueue an on-chain reputation update for tenantId.
   *
   * Uses the outbox so a chain failure never fails the rating DB write.
   * The canonical ref includes the ratingId so each new rating submission
   * creates a distinct outbox event; the contract SET semantics ensure
   * replaying the same event is idempotent.
   */
  async enqueueReputationUpdate(
    tenantId: string,
    aggregate: RatingAggregate,
    ratingId: string,
  ): Promise<void> {
    const payload = {
      tenantId,
      compositeScore: toOnChainScore(aggregate.overallAvg),
      paymentScore: toOnChainScore(aggregate.paymentTimelinessAvg),
      propertyCareScore: toOnChainScore(aggregate.propertyCareAvg),
      communicationScore: toOnChainScore(aggregate.communicationAvg),
      totalRatings: aggregate.totalRatings,
    }

    await outboxStore.create({
      txType: TxType.TENANT_REPUTATION_UPDATE,
      source: 'tenant_reputation',
      ref: `${tenantId}:${ratingId}`,
      payload,
      aggregateType: 'TenantReputation',
      aggregateId: tenantId,
      eventType: 'ReputationUpdated',
    })

    logger.info('Enqueued on-chain reputation update', {
      tenantId,
      ratingId,
      compositeScore: payload.compositeScore,
      totalRatings: payload.totalRatings,
    })
  }

  /**
   * Fetch the current on-chain reputation for a tenant (verification read path).
   * Returns null if the adapter does not support the operation or no record exists.
   */
  async getReputation(tenantId: string): Promise<TenantReputationRecord | null> {
    if (!this.adapter.getTenantReputation) {
      logger.warn('Adapter does not support getTenantReputation; skipping on-chain read', { tenantId })
      return null
    }
    return this.adapter.getTenantReputation(tenantId)
  }
}
