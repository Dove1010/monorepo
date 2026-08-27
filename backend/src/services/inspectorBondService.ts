import { SorobanAdapter } from '../soroban/adapter.js'
import { AppError } from '../errors/AppError.js'
import { ErrorCode } from '../errors/errorCodes.js'
import { logger } from '../utils/logger.js'
import { isTransientRpcError } from '../soroban/errors.js'

export interface BondStatus {
  isBonded: boolean
  amount: string
}

const MIN_BOND_AMOUNT = BigInt(process.env.INSPECTOR_MIN_BOND_AMOUNT ?? '100000000')
const CACHE_TTL_MS = parseInt(process.env.INSPECTOR_BOND_CACHE_TTL_MS ?? '30000', 10)

interface CacheEntry {
  isBonded: boolean
  amount: bigint
  expiresAt: number
}

export class InspectorBondService {
  private cache = new Map<string, CacheEntry>()

  constructor(private adapter: SorobanAdapter) {}

  private getCached(inspectorId: string): CacheEntry | undefined {
    const entry = this.cache.get(inspectorId)
    if (entry && Date.now() < entry.expiresAt) {
      return entry
    }
    this.cache.delete(inspectorId)
    return undefined
  }

  private setCached(inspectorId: string, isBonded: boolean, amount: bigint): void {
    this.cache.set(inspectorId, {
      isBonded,
      amount,
      expiresAt: Date.now() + CACHE_TTL_MS,
    })
  }

  clearCache(inspectorId?: string): void {
    if (inspectorId) {
      this.cache.delete(inspectorId)
    } else {
      this.cache.clear()
    }
  }

  async stake(inspectorId: string, amount: bigint): Promise<void> {
    if (amount <= 0n) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 400, 'Bond amount must be greater than zero')
    }
    logger.info('Inspector staking bond', { inspectorId, amount: amount.toString() })
    await this.adapter.stakeBond(inspectorId, amount)
    this.clearCache(inspectorId)
  }

  async unstake(inspectorId: string): Promise<void> {
    const bonded = await this.adapter.isBonded(inspectorId)
    if (!bonded) {
      throw new AppError(ErrorCode.INSPECTOR_NOT_BONDED, 400, 'No active bond to unstake')
    }
    logger.info('Inspector unstaking bond', { inspectorId })
    await this.adapter.unstakeBond(inspectorId)
    this.clearCache(inspectorId)
  }

  async getStatus(inspectorId: string): Promise<BondStatus> {
    const cached = this.getCached(inspectorId)
    if (cached) {
      return { isBonded: cached.isBonded, amount: cached.amount.toString() }
    }
    const { isBonded, amount } = await this.adapter.getBond(inspectorId)
    this.setCached(inspectorId, isBonded, amount)
    return { isBonded, amount: amount.toString() }
  }

  getMinBondAmount(): bigint {
    return MIN_BOND_AMOUNT
  }

  async assertBonded(inspectorId: string): Promise<void> {
    const cached = this.getCached(inspectorId)
    if (cached) {
      if (!cached.isBonded || cached.amount < MIN_BOND_AMOUNT) {
        throw new AppError(
          ErrorCode.INSPECTOR_NOT_BONDED,
          403,
          'Inspector must post a bond before claiming jobs',
        )
      }
      return
    }

    try {
      const bonded = await this.adapter.isBonded(inspectorId)
      let amount = 0n
      if (bonded) {
        const bond = await this.adapter.getBond(inspectorId)
        amount = bond.amount
      }
      this.setCached(inspectorId, bonded, amount)

      if (!bonded || amount < MIN_BOND_AMOUNT) {
        throw new AppError(
          ErrorCode.INSPECTOR_NOT_BONDED,
          403,
          'Inspector must post a bond before claiming jobs',
        )
      }
    } catch (error) {
      if (error instanceof AppError) {
        throw error
      }

      logger.warn('Bond check failed — denying access (fail-safe)', {
        inspectorId,
        errorMessage: error instanceof Error ? error.message : String(error),
      })

      if (isTransientRpcError(error)) {
        throw new AppError(
          ErrorCode.CHAIN_UNAVAILABLE,
          503,
          'Unable to verify bond status at this time. Please try again later.',
        )
      }

      throw new AppError(
        ErrorCode.INSPECTOR_NOT_BONDED,
        403,
        'Inspector must post a bond before claiming jobs',
      )
    }
  }
}
