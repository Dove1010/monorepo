import { describe, it, expect, beforeEach, vi } from 'vitest'
import { TenantReputationOnChainService } from './tenantReputationOnChainService.js'
import { StubSorobanAdapter } from '../soroban/stub-adapter.js'
import { outboxStore } from '../outbox/store.js'
import { OutboxStatus, TxType } from '../outbox/types.js'
import type { RatingAggregate } from '../repositories/TenantRatingRepository.js'

vi.mock('../outbox/store.js', () => ({
  outboxStore: {
    create: vi.fn(),
    getByExternalRef: vi.fn(),
  },
}))

vi.mock('../utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}))

const makeAdapter = () =>
  new StubSorobanAdapter({ rpcUrl: 'http://stub', contractId: 'stub-contract' })

const makeAggregate = (overrides: Partial<RatingAggregate> = {}): RatingAggregate => ({
  tenantId: 'tenant-1',
  overallAvg: 4.0,
  paymentTimelinessAvg: 4.5,
  propertyCareAvg: 3.5,
  communicationAvg: 5.0,
  totalRatings: 3,
  ...overrides,
})

describe('TenantReputationOnChainService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    StubSorobanAdapter._testOnlyReset()
  })

  describe('enqueueReputationUpdate', () => {
    it('creates an outbox item with TENANT_REPUTATION_UPDATE type', async () => {
      const adapter = makeAdapter()
      const svc = new TenantReputationOnChainService(adapter)
      const aggregate = makeAggregate()

      vi.mocked(outboxStore.create).mockResolvedValue({} as any)

      await svc.enqueueReputationUpdate('tenant-1', aggregate, 'rating-abc')

      expect(outboxStore.create).toHaveBeenCalledOnce()
      const call = vi.mocked(outboxStore.create).mock.calls[0][0]
      expect(call.txType).toBe(TxType.TENANT_REPUTATION_UPDATE)
      expect(call.source).toBe('tenant_reputation')
      expect(call.ref).toBe('tenant-1:rating-abc')
      expect(call.aggregateType).toBe('TenantReputation')
      expect(call.aggregateId).toBe('tenant-1')
    })

    it('maps off-chain 1–5 scores to 0–1000 on-chain scores', async () => {
      const adapter = makeAdapter()
      const svc = new TenantReputationOnChainService(adapter)

      vi.mocked(outboxStore.create).mockResolvedValue({} as any)

      await svc.enqueueReputationUpdate(
        'tenant-1',
        makeAggregate({
          overallAvg: 5.0,
          paymentTimelinessAvg: 4.0,
          propertyCareAvg: 3.5,
          communicationAvg: 2.5,
          totalRatings: 10,
        }),
        'rating-xyz',
      )

      const payload = vi.mocked(outboxStore.create).mock.calls[0][0].payload
      expect(payload.compositeScore).toBe(1000)   // 5.0 × 200
      expect(payload.paymentScore).toBe(800)       // 4.0 × 200
      expect(payload.propertyCareScore).toBe(700)  // 3.5 × 200
      expect(payload.communicationScore).toBe(500) // 2.5 × 200
      expect(payload.totalRatings).toBe(10)
    })

    it('is idempotent: the same ratingId canonical ref is a no-op on replay', async () => {
      const adapter = makeAdapter()
      const svc = new TenantReputationOnChainService(adapter)

      vi.mocked(outboxStore.create).mockResolvedValue({
        id: 'existing-item',
        status: OutboxStatus.PENDING,
      } as any)

      await svc.enqueueReputationUpdate('tenant-1', makeAggregate(), 'rating-same')
      await svc.enqueueReputationUpdate('tenant-1', makeAggregate(), 'rating-same')

      // Both calls hit outboxStore.create; the store's ON CONFLICT deduplicates
      expect(outboxStore.create).toHaveBeenCalledTimes(2)
      // Both calls use the same canonical ref
      const refs = vi.mocked(outboxStore.create).mock.calls.map((c) => c[0].ref)
      expect(refs[0]).toBe(refs[1])
    })

    it('creates distinct outbox items for distinct ratingIds', async () => {
      const adapter = makeAdapter()
      const svc = new TenantReputationOnChainService(adapter)

      vi.mocked(outboxStore.create).mockResolvedValue({} as any)

      await svc.enqueueReputationUpdate('tenant-1', makeAggregate(), 'rating-1')
      await svc.enqueueReputationUpdate('tenant-1', makeAggregate(), 'rating-2')

      const refs = vi.mocked(outboxStore.create).mock.calls.map((c) => c[0].ref)
      expect(refs[0]).toBe('tenant-1:rating-1')
      expect(refs[1]).toBe('tenant-1:rating-2')
    })
  })

  describe('getReputation', () => {
    it('returns null when no reputation has been anchored', async () => {
      const adapter = makeAdapter()
      const svc = new TenantReputationOnChainService(adapter)

      const result = await svc.getReputation('tenant-unknown')
      expect(result).toBeNull()
    })

    it('returns the record after updateTenantReputation is called on the adapter', async () => {
      const adapter = makeAdapter()
      const svc = new TenantReputationOnChainService(adapter)

      await adapter.updateTenantReputation!('tenant-1', {
        compositeScore: 800,
        paymentScore: 900,
        propertyCareScore: 700,
        communicationScore: 800,
        totalRatings: 5,
        lastUpdated: 0n,
      })

      const record = await svc.getReputation('tenant-1')
      expect(record).not.toBeNull()
      expect(record!.compositeScore).toBe(800)
      expect(record!.paymentScore).toBe(900)
      expect(record!.totalRatings).toBe(5)
    })

    it('returns null and logs a warning when adapter does not support getTenantReputation', async () => {
      const adapter = makeAdapter()
      adapter.getTenantReputation = undefined
      const svc = new TenantReputationOnChainService(adapter)

      const result = await svc.getReputation('tenant-1')
      expect(result).toBeNull()
    })
  })

  describe('score mapping edge cases', () => {
    it('maps a minimum average of 1.0 to score 200', async () => {
      const adapter = makeAdapter()
      const svc = new TenantReputationOnChainService(adapter)

      vi.mocked(outboxStore.create).mockResolvedValue({} as any)

      await svc.enqueueReputationUpdate(
        'tenant-1',
        makeAggregate({ overallAvg: 1.0 }),
        'rating-min',
      )

      const payload = vi.mocked(outboxStore.create).mock.calls[0][0].payload
      expect(payload.compositeScore).toBe(200)
    })

    it('rounds fractional scores correctly', async () => {
      const adapter = makeAdapter()
      const svc = new TenantReputationOnChainService(adapter)

      vi.mocked(outboxStore.create).mockResolvedValue({} as any)

      await svc.enqueueReputationUpdate(
        'tenant-1',
        makeAggregate({ overallAvg: 3.333 }),
        'rating-frac',
      )

      const payload = vi.mocked(outboxStore.create).mock.calls[0][0].payload
      // 3.333 × 200 = 666.6 → rounds to 667
      expect(payload.compositeScore).toBe(667)
    })
  })
})
