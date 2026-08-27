import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Keypair } from '@stellar/stellar-sdk'
import { RentToOwnSyncWorker } from './rentToOwnSyncWorker.js'
import { outboxStore } from '../outbox/store.js'
import { OutboxStatus, TxType } from '../outbox/types.js'
import { userStore } from '../models/authStore.js'

const TENANT_ADDRESS = Keypair.random().publicKey()

describe('RentToOwnSyncWorker', () => {
  beforeEach(async () => {
    await outboxStore.clear()
    process.env.DEAL_SYNC_ENABLED = 'true'
    vi.spyOn(userStore, 'getById').mockResolvedValue({
      id: 'tenant-1',
      email: 'tenant@example.com',
      createdAt: new Date(),
      name: 'Tenant One',
      role: 'tenant',
      walletAddress: TENANT_ADDRESS,
      tier: 'free',
      planQuota: 0,
      displayCurrency: 'NGN',
    } as any)
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    delete process.env.DEAL_SYNC_ENABLED
    await outboxStore.clear()
  })

  it('does nothing when deal sync is disabled', async () => {
    process.env.DEAL_SYNC_ENABLED = 'false'
    await outboxStore.create({
      txType: TxType.RENT_TO_OWN_DEAL_REGISTERED,
      source: 'rent_to_own',
      ref: 'deal-1:register',
      payload: {
        dealId: 'deal-1',
        contractDealId: 'a'.repeat(64),
        tenantId: 'tenant-1',
        propertyValueUsdc: '600.000000',
        monthlyEquityUsdc: '50.000000',
        totalPaymentsRequired: 12,
      },
    })

    const adapter = { registerRentToOwnDeal: vi.fn() } as any
    const worker = new RentToOwnSyncWorker(adapter)
    await worker.process()

    expect(adapter.registerRentToOwnDeal).not.toHaveBeenCalled()
  })

  it('registers a deal and resolves the tenant Stellar address', async () => {
    const item = await outboxStore.create({
      txType: TxType.RENT_TO_OWN_DEAL_REGISTERED,
      source: 'rent_to_own',
      ref: 'deal-1:register',
      payload: {
        dealId: 'deal-1',
        contractDealId: 'a'.repeat(64),
        tenantId: 'tenant-1',
        propertyValueUsdc: '600.000000',
        monthlyEquityUsdc: '50.000000',
        totalPaymentsRequired: 12,
      },
    })

    const adapter = { registerRentToOwnDeal: vi.fn().mockResolvedValue(undefined) } as any
    const worker = new RentToOwnSyncWorker(adapter)
    await worker.process()

    expect(adapter.registerRentToOwnDeal).toHaveBeenCalledWith(
      expect.objectContaining({
        dealId: 'deal-1',
        contractDealId: 'a'.repeat(64),
        tenantAddress: TENANT_ADDRESS,
        propertyValueUsdc: '600.000000',
        monthlyEquityUsdc: '50.000000',
        totalPaymentsRequired: 12,
      }),
    )

    const updated = await outboxStore.getById(item.id)
    expect(updated?.status).toBe(OutboxStatus.SENT)
  })

  it('records an equity payment', async () => {
    const item = await outboxStore.create({
      txType: TxType.RENT_TO_OWN_EQUITY_PAYMENT,
      source: 'rent_to_own',
      ref: 'deal-1:equity:1',
      payload: {
        dealId: 'deal-1',
        contractDealId: 'a'.repeat(64),
        period: 1,
        rentAmountUsdc: '50.000000',
        equityAmountUsdc: '50.000000',
      },
    })

    const adapter = { recordRentToOwnEquityPayment: vi.fn().mockResolvedValue(undefined) } as any
    const worker = new RentToOwnSyncWorker(adapter)
    await worker.process()

    expect(adapter.recordRentToOwnEquityPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        dealId: 'deal-1',
        contractDealId: 'a'.repeat(64),
        period: 1,
        rentAmountUsdc: '50.000000',
        equityAmountUsdc: '50.000000',
      }),
    )

    const updated = await outboxStore.getById(item.id)
    expect(updated?.status).toBe(OutboxStatus.SENT)
  })

  it('retries with backoff on failure and dead-letters after max retries', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    const item = await outboxStore.create({
      txType: TxType.RENT_TO_OWN_EQUITY_PAYMENT,
      source: 'rent_to_own',
      ref: 'deal-2:equity:1',
      payload: {
        dealId: 'deal-2',
        contractDealId: 'b'.repeat(64),
        period: 1,
        rentAmountUsdc: '50.000000',
        equityAmountUsdc: '50.000000',
      },
    })

    const adapter = {
      recordRentToOwnEquityPayment: vi.fn().mockRejectedValue(new Error('rpc down')),
    } as any
    const worker = new RentToOwnSyncWorker(adapter)

    // First attempt fails -> FAILED with backoff
    await worker.process()
    let updated = await outboxStore.getById(item.id)
    expect(updated?.status).toBe(OutboxStatus.FAILED)
    expect(updated?.retryCount).toBe(1)

    // Advance past backoff and retry up to the max, then dead-letter
    for (let i = 0; i < 5; i++) {
      vi.setSystemTime(new Date(Date.now() + 60 * 60 * 1000))
      await worker.process()
    }

    updated = await outboxStore.getById(item.id)
    expect(updated?.status).toBe(OutboxStatus.DEAD)

    vi.useRealTimers()
  })
})
