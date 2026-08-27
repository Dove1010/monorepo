import { Router, type Response, type NextFunction } from 'express'
import { SorobanAdapter, type DelegationPosition } from '../soroban/adapter.js'
import { logger } from '../utils/logger.js'
import { AppError } from '../errors/AppError.js'
import { ErrorCode } from '../errors/errorCodes.js'
import { validate } from '../middleware/validate.js'
import { authenticateToken, type AuthenticatedRequest } from '../middleware/auth.js'
import { LinkedAddressStore } from '../models/linkedAddressStore.js'
import { WalletService } from '../services/walletService.js'
import { env } from '../schemas/env.js'
import {
  delegateSchema,
  requestUndelegateSchema,
  completeUndelegateSchema,
  setCommissionSchema,
  type DelegateRequest,
  type RequestUndelegateRequest,
  type CompleteUndelegateRequest,
  type SetCommissionRequest,
} from '../schemas/stakingDelegation.js'

/**
 * Delegated staking, backed by the `stake_delegation` contract (#1489).
 *
 * stake_delegation is a *standalone* ledger: it keeps its own staked balance,
 * total-staked and reward index, and never reads or writes staking_pool. A
 * user's delegated position is therefore a second, independent position — the
 * responses here never mix it with the staking_pool figures served by
 * /api/staking/position.
 */

function formatAmount6(amountMicro: bigint): string {
  const negative = amountMicro < 0n
  const abs = negative ? -amountMicro : amountMicro
  const whole = abs / 1_000_000n
  const frac = (abs % 1_000_000n).toString().padStart(6, '0')
  return `${negative ? '-' : ''}${whole.toString()}.${frac}`
}

/** Parse a `123.456789` USDC string into integer micro-USDC. */
function parseAmount6(amountUsdc: string): bigint {
  const [whole, frac = ''] = amountUsdc.split('.')
  return BigInt(whole) * 1_000_000n + BigInt(frac.padEnd(6, '0'))
}

export function createStakingDelegationRouter(
  adapter: SorobanAdapter,
  walletService: WalletService,
  linkedAddressStore: LinkedAddressStore,
) {
  const router = Router()

  /**
   * Resolve the Stellar address acting for this request, using the same
   * precedence as the rest of the staking API: explicit header, then the
   * custodial wallet, then the user's linked address.
   */
  async function resolveAccount(req: AuthenticatedRequest): Promise<string> {
    const userId = req.user?.id
    if (!userId) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 401, 'Authentication required')
    }

    const accountHeader = req.headers['x-wallet-address']
    if (typeof accountHeader === 'string' && accountHeader.length > 0) {
      return accountHeader
    }
    if (env.CUSTODIAL_MODE_ENABLED) {
      return walletService.getPublicAddress(userId)
    }
    const linked = await linkedAddressStore.getLinkedAddress(userId)
    if (!linked) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        400,
        'No linked wallet address found for user',
      )
    }
    return linked
  }

  /**
   * The stake_delegation contract is optional deployment-wise, so every handler
   * checks the methods it needs and reports 503 rather than crashing when
   * SOROBAN_STAKE_DELEGATION_ID is unset or the adapter predates this feature.
   */
  function requireDelegationSupport(
    ...methods: Array<keyof SorobanAdapter>
  ): void {
    const missing = methods.filter((method) => typeof adapter[method] !== 'function')
    if (missing.length > 0) {
      throw new AppError(
        ErrorCode.SERVICE_UNAVAILABLE,
        503,
        'Delegated staking is not available',
      )
    }
  }

  /**
   * GET /api/staking/delegation/position
   *
   * The caller's delegated-staking position: what stake_delegation holds for
   * them, how much of it is currently delegated, and to whom.
   */
  router.get(
    '/position',
    authenticateToken,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        requireDelegationSupport(
          'getDelegationStakedBalance',
          'getDelegations',
          'getDelegationEpoch',
        )
        const account = await resolveAccount(req)

        const [staked, delegations, currentEpoch] = await Promise.all([
          adapter.getDelegationStakedBalance!(account),
          adapter.getDelegations!(account),
          adapter.getDelegationEpoch!(),
        ])

        const delegated = delegations.reduce((sum, row) => sum + row.amount, 0n)
        const position: DelegationPosition = {
          staked,
          delegated,
          free: staked - delegated,
          currentEpoch,
          delegations,
        }

        res.status(200).json({
          success: true,
          position: {
            staked: formatAmount6(position.staked),
            delegated: formatAmount6(position.delegated),
            free: formatAmount6(position.free),
            currentEpoch: position.currentEpoch,
            delegations: position.delegations.map((row) => ({
              delegatee: row.delegatee,
              amountUsdc: formatAmount6(row.amount),
              activatedEpoch: row.activatedEpoch,
            })),
          },
        })
      } catch (error) {
        next(error)
      }
    },
  )

  /**
   * GET /api/staking/delegation/delegatee-earnings
   *
   * What the caller has earned *as a delegatee*: net rewards after their own
   * commission split, and the commission balance itself.
   */
  router.get(
    '/delegatee-earnings',
    authenticateToken,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        requireDelegationSupport('getDelegateeClaimable', 'getDelegateeCommissionClaimable')
        const account = await resolveAccount(req)

        const [claimable, commissionClaimable] = await Promise.all([
          adapter.getDelegateeClaimable!(account),
          adapter.getDelegateeCommissionClaimable!(account),
        ])

        res.status(200).json({
          success: true,
          delegatee: account,
          earnings: {
            claimable: formatAmount6(claimable),
            commissionClaimable: formatAmount6(commissionClaimable),
          },
        })
      } catch (error) {
        next(error)
      }
    },
  )

  /**
   * POST /api/staking/delegation/delegate
   *
   * Routes part of the caller's stake_delegation balance to a delegatee.
   */
  router.post(
    '/delegate',
    authenticateToken,
    validate(delegateSchema),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        requireDelegationSupport('delegateStake')
        const { delegatee, amountUsdc } = req.body as DelegateRequest
        const delegator = await resolveAccount(req)

        if (delegatee === delegator) {
          throw new AppError(
            ErrorCode.VALIDATION_ERROR,
            400,
            'Cannot delegate stake to your own address',
          )
        }

        const amount = parseAmount6(amountUsdc)
        if (amount <= 0n) {
          throw new AppError(ErrorCode.VALIDATION_ERROR, 400, 'amountUsdc must be greater than zero')
        }

        const txHash = await adapter.delegateStake!(delegator, delegatee, amount)

        logger.info('Stake delegated', {
          requestId: req.requestId,
          delegator,
          delegatee,
          amountUsdc,
          txHash,
        })

        res.status(200).json({
          success: true,
          txHash,
          delegation: { delegatee, amountUsdc },
          message: 'Stake delegated',
        })
      } catch (error) {
        next(error)
      }
    },
  )

  /**
   * POST /api/staking/delegation/undelegate/request
   *
   * Opens the contract's undelegation cooldown. The stake stays delegated (and
   * keeps accruing to the delegatee) until /undelegate/complete succeeds.
   */
  router.post(
    '/undelegate/request',
    authenticateToken,
    validate(requestUndelegateSchema),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        requireDelegationSupport('requestUndelegate')
        const { delegatee, amountUsdc } = req.body as RequestUndelegateRequest
        const delegator = await resolveAccount(req)

        const amount = parseAmount6(amountUsdc)
        if (amount <= 0n) {
          throw new AppError(ErrorCode.VALIDATION_ERROR, 400, 'amountUsdc must be greater than zero')
        }

        const txHash = await adapter.requestUndelegate!(delegator, delegatee, amount)

        logger.info('Undelegation requested', {
          requestId: req.requestId,
          delegator,
          delegatee,
          amountUsdc,
          txHash,
        })

        res.status(202).json({
          success: true,
          txHash,
          message: 'Undelegation requested; complete it once the cooldown has elapsed',
        })
      } catch (error) {
        next(error)
      }
    },
  )

  /**
   * POST /api/staking/delegation/undelegate/complete
   *
   * Settles a pending undelegation. The contract rejects this with
   * CooldownNotElapsed until its configured cooldown has passed.
   */
  router.post(
    '/undelegate/complete',
    authenticateToken,
    validate(completeUndelegateSchema),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        requireDelegationSupport('completeUndelegate')
        const { delegatee } = req.body as CompleteUndelegateRequest
        const delegator = await resolveAccount(req)

        const txHash = await adapter.completeUndelegate!(delegator, delegatee)

        logger.info('Undelegation completed', {
          requestId: req.requestId,
          delegator,
          delegatee,
          txHash,
        })

        res.status(200).json({
          success: true,
          txHash,
          message: 'Undelegation completed',
        })
      } catch (error) {
        next(error)
      }
    },
  )

  /**
   * POST /api/staking/delegation/commission
   *
   * Sets the commission the caller charges the stake delegated to them.
   */
  router.post(
    '/commission',
    authenticateToken,
    validate(setCommissionSchema),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        requireDelegationSupport('setDelegateeCommission')
        const { rateBps } = req.body as SetCommissionRequest
        const delegatee = await resolveAccount(req)

        const txHash = await adapter.setDelegateeCommission!(delegatee, rateBps)

        logger.info('Delegatee commission set', {
          requestId: req.requestId,
          delegatee,
          rateBps,
          txHash,
        })

        res.status(200).json({ success: true, txHash, rateBps })
      } catch (error) {
        next(error)
      }
    },
  )

  /**
   * POST /api/staking/delegation/claim-rewards
   *
   * Claims the caller's net delegatee rewards (gross minus their commission).
   */
  router.post(
    '/claim-rewards',
    authenticateToken,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        requireDelegationSupport('claimDelegateeRewards')
        const delegatee = await resolveAccount(req)
        const txHash = await adapter.claimDelegateeRewards!(delegatee)

        logger.info('Delegatee rewards claimed', {
          requestId: req.requestId,
          delegatee,
          txHash,
        })

        res.status(200).json({ success: true, txHash, message: 'Delegatee rewards claimed' })
      } catch (error) {
        next(error)
      }
    },
  )

  /**
   * POST /api/staking/delegation/claim-commission
   *
   * Claims the caller's accrued commission balance.
   */
  router.post(
    '/claim-commission',
    authenticateToken,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        requireDelegationSupport('claimDelegateeCommission')
        const delegatee = await resolveAccount(req)
        const txHash = await adapter.claimDelegateeCommission!(delegatee)

        logger.info('Delegatee commission claimed', {
          requestId: req.requestId,
          delegatee,
          txHash,
        })

        res.status(200).json({ success: true, txHash, message: 'Commission claimed' })
      } catch (error) {
        next(error)
      }
    },
  )

  return router
}
