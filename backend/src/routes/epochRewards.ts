import { Router, Response } from 'express'
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js'
import { AppError } from '../errors/AppError.js'
import { ErrorCode } from '../errors/errorCodes.js'
import { createSorobanAdapter, getSorobanConfigFromEnv } from '../soroban/index.js'
import { logger } from '../utils/logger.js'

const router = Router()

router.post(
  '/stake',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response, next) => {
    try {
      const { amount } = req.body

      if (!amount || typeof amount !== 'string') {
        throw new AppError(ErrorCode.VALIDATION_ERROR, 400, 'Amount is required and must be a string')
      }

      const amountBigInt = BigInt(amount)
      if (amountBigInt <= 0n) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, 400, 'Amount must be positive')
      }

      if (!req.user?.walletAddress) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, 400, 'User must have a wallet address')
      }

      const sorobanConfig = getSorobanConfigFromEnv(process.env)
      const sorobanAdapter = createSorobanAdapter(sorobanConfig)

      if (!sorobanAdapter.epochStake) {
        throw new AppError(ErrorCode.SOROBAN_ERROR, 502, 'Epoch rewards staking not available')
      }

      const txHash = await sorobanAdapter.epochStake(req.user.walletAddress, amountBigInt)

      logger.info('Epoch rewards stake submitted', {
        userId: req.user.id,
        walletAddress: req.user.walletAddress,
        amount: amount,
        txHash,
      })

      res.json({ success: true, txHash })
    } catch (error) {
      next(error)
    }
  },
)

router.post(
  '/unstake',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response, next) => {
    try {
      const { amount } = req.body

      if (!amount || typeof amount !== 'string') {
        throw new AppError(ErrorCode.VALIDATION_ERROR, 400, 'Amount is required and must be a string')
      }

      const amountBigInt = BigInt(amount)
      if (amountBigInt <= 0n) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, 400, 'Amount must be positive')
      }

      if (!req.user?.walletAddress) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, 400, 'User must have a wallet address')
      }

      const sorobanConfig = getSorobanConfigFromEnv(process.env)
      const sorobanAdapter = createSorobanAdapter(sorobanConfig)

      if (!sorobanAdapter.epochUnstake) {
        throw new AppError(ErrorCode.SOROBAN_ERROR, 502, 'Epoch rewards unstaking not available')
      }

      const txHash = await sorobanAdapter.epochUnstake(req.user.walletAddress, amountBigInt)

      logger.info('Epoch rewards unstake submitted', {
        userId: req.user.id,
        walletAddress: req.user.walletAddress,
        amount: amount,
        txHash,
      })

      res.json({ success: true, txHash })
    } catch (error) {
      next(error)
    }
  },
)

router.post(
  '/claim',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response, next) => {
    try {
      if (!req.user?.walletAddress) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, 400, 'User must have a wallet address')
      }

      const sorobanConfig = getSorobanConfigFromEnv(process.env)
      const sorobanAdapter = createSorobanAdapter(sorobanConfig)

      if (!sorobanAdapter.epochClaim) {
        throw new AppError(ErrorCode.SOROBAN_ERROR, 502, 'Epoch rewards claim not available')
      }

      const claimedAmount = await sorobanAdapter.epochClaim(req.user.walletAddress)

      logger.info('Epoch rewards claim submitted', {
        userId: req.user.id,
        walletAddress: req.user.walletAddress,
        claimedAmount: claimedAmount.toString(),
      })

      res.json({ success: true, claimedAmount: claimedAmount.toString() })
    } catch (error) {
      next(error)
    }
  },
)

router.get(
  '/claimable',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response, next) => {
    try {
      if (!req.user?.walletAddress) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, 400, 'User must have a wallet address')
      }

      const sorobanConfig = getSorobanConfigFromEnv(process.env)
      const sorobanAdapter = createSorobanAdapter(sorobanConfig)

      if (!sorobanAdapter.epochGetClaimable) {
        throw new AppError(ErrorCode.SOROBAN_ERROR, 502, 'Epoch rewards claimable query not available')
      }

      const claimable = await sorobanAdapter.epochGetClaimable(req.user.walletAddress)

      res.json({ success: true, claimable: claimable.toString() })
    } catch (error) {
      next(error)
    }
  },
)

router.get(
  '/epoch/:epochNumber',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response, next) => {
    try {
      const epochNumber = parseInt(req.params.epochNumber, 10)
      if (isNaN(epochNumber) || epochNumber < 1) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, 400, 'Invalid epoch number')
      }

      const sorobanConfig = getSorobanConfigFromEnv(process.env)
      const sorobanAdapter = createSorobanAdapter(sorobanConfig)

      if (!sorobanAdapter.epochGetEpoch) {
        throw new AppError(ErrorCode.SOROBAN_ERROR, 502, 'Epoch rewards epoch query not available')
      }

      const epochInfo = await sorobanAdapter.epochGetEpoch(epochNumber)

      if (!epochInfo) {
        throw new AppError(ErrorCode.NOT_FOUND, 404, 'Epoch not found')
      }

      res.json({ success: true, data: epochInfo })
    } catch (error) {
      next(error)
    }
  },
)

router.get(
  '/current-epoch',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response, next) => {
    try {
      const sorobanConfig = getSorobanConfigFromEnv(process.env)
      const sorobanAdapter = createSorobanAdapter(sorobanConfig)

      if (!sorobanAdapter.epochGetCurrentEpoch) {
        throw new AppError(ErrorCode.SOROBAN_ERROR, 502, 'Epoch rewards current epoch query not available')
      }

      const currentEpoch = await sorobanAdapter.epochGetCurrentEpoch()

      res.json({ success: true, currentEpoch })
    } catch (error) {
      next(error)
    }
  },
)

router.get(
  '/total-staked',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response, next) => {
    try {
      const sorobanConfig = getSorobanConfigFromEnv(process.env)
      const sorobanAdapter = createSorobanAdapter(sorobanConfig)

      if (!sorobanAdapter.epochGetTotalStaked) {
        throw new AppError(ErrorCode.SOROBAN_ERROR, 502, 'Epoch rewards total staked query not available')
      }

      const totalStaked = await sorobanAdapter.epochGetTotalStaked()

      res.json({ success: true, totalStaked: totalStaked.toString() })
    } catch (error) {
      next(error)
    }
  },
)

export function createEpochRewardsRouter(): Router {
  return router
}
