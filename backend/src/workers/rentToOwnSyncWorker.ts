import { SorobanAdapter } from '../soroban/adapter.js'
import { logger } from '../utils/logger.js'
import { outboxStore } from '../outbox/store.js'
import { OutboxStatus, TxType, type OutboxItem } from '../outbox/types.js'
import { isDealSyncEnabled } from '../services/deals/dealSyncConfig.js'
import { userStore } from '../models/authStore.js'
import { normalizeStellarAddress } from '../utils/wallet.js'

const MAX_RENT_TO_OWN_SYNC_RETRIES = 5
const BASE_BACKOFF_MS = 1000

function getBackoffMs(retryCount: number): number {
  return Math.min(Math.pow(2, retryCount) * BASE_BACKOFF_MS, 60 * 60 * 1000)
}

function shouldRetry(item: OutboxItem): boolean {
  if (item.retryCount >= MAX_RENT_TO_OWN_SYNC_RETRIES) return false
  if (!item.nextRetryAt) return true
  return Date.now() >= new Date(item.nextRetryAt).getTime()
}

/**
 * Polls outbox records for rent_to_own deal registration and equity-payment
 * events and invokes the corresponding rent_to_own contract call on Soroban.
 *
 * Mirrors DealStatusSyncWorker's retry/backoff/dead-letter shape — a failed
 * on-chain call retries with exponential backoff and dead-letters after
 * MAX_RENT_TO_OWN_SYNC_RETRIES attempts rather than silently dropping the
 * deal or payment.
 */
export class RentToOwnSyncWorker {
  private intervalId: NodeJS.Timeout | null = null
  private running = false
  private processingPromise: Promise<void> | null = null

  constructor(private adapter: SorobanAdapter) {}

  start(intervalMs = 30000) {
    if (this.running) return
    this.running = true
    this.intervalId = setInterval(() => {
      this.processingPromise = this.process().finally(() => {
        this.processingPromise = null
      })
    }, intervalMs)
    logger.info('RentToOwnSyncWorker started', { intervalMs, enabled: isDealSyncEnabled() })
  }

  async stop() {
    this.running = false
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    if (this.processingPromise) {
      await this.processingPromise
    }
    logger.info('RentToOwnSyncWorker stopped')
  }

  async process() {
    if (!isDealSyncEnabled()) {
      return
    }

    const pending = await outboxStore.listByStatus(OutboxStatus.PENDING)
    const failed = await outboxStore.listByStatus(OutboxStatus.FAILED)
    const items = [...pending, ...failed].filter(
      (item) =>
        item.txType === TxType.RENT_TO_OWN_DEAL_REGISTERED ||
        item.txType === TxType.RENT_TO_OWN_EQUITY_PAYMENT,
    )

    for (const item of items) {
      if (item.status === OutboxStatus.FAILED && !shouldRetry(item)) {
        if (item.retryCount >= MAX_RENT_TO_OWN_SYNC_RETRIES) {
          await outboxStore.markDead(item.id, 'Max rent_to_own sync retry count reached')
          logger.error('rent_to_own sync dead-lettered', {
            outboxId: item.id,
            dealId: item.payload.dealId,
            txType: item.txType,
            retryCount: item.retryCount,
            lastError: item.lastError,
          })
        }
        continue
      }

      await this.sendRentToOwnEvent(item)
    }
  }

  private async sendRentToOwnEvent(item: OutboxItem): Promise<void> {
    try {
      if (item.txType === TxType.RENT_TO_OWN_DEAL_REGISTERED) {
        await this.sendRegistration(item)
      } else {
        await this.sendEquityPayment(item)
      }

      await outboxStore.updateStatus(item.id, OutboxStatus.SENT)
      logger.info('rent_to_own sync succeeded', {
        outboxId: item.id,
        dealId: item.payload.dealId,
        txType: item.txType,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const currentRetryCount = item.retryCount || 0
      const nextRetryAt = new Date(Date.now() + getBackoffMs(currentRetryCount))

      if (currentRetryCount + 1 >= MAX_RENT_TO_OWN_SYNC_RETRIES) {
        await outboxStore.markDead(item.id, errorMessage)
        logger.error('rent_to_own sync failed — dead-lettered', {
          outboxId: item.id,
          dealId: item.payload.dealId,
          txType: item.txType,
          retryCount: currentRetryCount + 1,
          lastError: errorMessage,
        })
        return
      }

      await outboxStore.updateStatus(item.id, OutboxStatus.FAILED, {
        error: errorMessage,
        nextRetryAt,
      })
      logger.warn('rent_to_own sync failed — will retry', {
        outboxId: item.id,
        dealId: item.payload.dealId,
        txType: item.txType,
        retryCount: currentRetryCount + 1,
        lastError: errorMessage,
      })
    }
  }

  private async sendRegistration(item: OutboxItem): Promise<void> {
    if (!this.adapter.registerRentToOwnDeal) return

    const payload = item.payload
    const dealId = String(payload.dealId ?? '')
    const contractDealId = String(payload.contractDealId ?? '')
    const tenantId = String(payload.tenantId ?? '')
    if (!dealId || !contractDealId || !tenantId) {
      throw new Error('Invalid RENT_TO_OWN_DEAL_REGISTERED payload')
    }

    const tenant = await userStore.getById(tenantId)
    if (!tenant?.walletAddress) {
      throw new Error(`Tenant ${tenantId} has no linked Stellar wallet address`)
    }
    const tenantAddress = normalizeStellarAddress(tenant.walletAddress)

    await this.adapter.registerRentToOwnDeal({
      dealId,
      contractDealId,
      tenantAddress,
      propertyValueUsdc: String(payload.propertyValueUsdc ?? '0'),
      monthlyEquityUsdc: String(payload.monthlyEquityUsdc ?? '0'),
      totalPaymentsRequired: Number(payload.totalPaymentsRequired ?? 0),
    })
  }

  private async sendEquityPayment(item: OutboxItem): Promise<void> {
    if (!this.adapter.recordRentToOwnEquityPayment) return

    const payload = item.payload
    const dealId = String(payload.dealId ?? '')
    const contractDealId = String(payload.contractDealId ?? '')
    if (!dealId || !contractDealId) {
      throw new Error('Invalid RENT_TO_OWN_EQUITY_PAYMENT payload')
    }

    await this.adapter.recordRentToOwnEquityPayment({
      dealId,
      contractDealId,
      period: Number(payload.period ?? 0),
      rentAmountUsdc: String(payload.rentAmountUsdc ?? '0'),
      equityAmountUsdc: String(payload.equityAmountUsdc ?? '0'),
    })
  }
}
