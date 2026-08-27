import { Router, type Response, type NextFunction } from 'express'
import { authenticateToken, type AuthenticatedRequest } from '../middleware/auth.js'
import { creditScoreService } from '../services/creditScoreService.js'
import { AppError } from '../errors/AppError.js'
import { ErrorCode } from '../errors/errorCodes.js'
import type { CreditScoreSnapshot } from '../models/creditScoreSnapshot.js'

function requireAdmin(req: AuthenticatedRequest): void {
  if (!req.user) {
    throw new AppError(ErrorCode.UNAUTHORIZED, 401, 'Authentication required')
  }
  if (!['admin', 'super_admin'].includes(req.user.role)) {
    throw new AppError(ErrorCode.FORBIDDEN, 403, 'Admin role required')
  }
}

function serializeSnapshot(snapshot: CreditScoreSnapshot, includeFactors = true) {
  return {
    score: snapshot.score,
    band: snapshot.band,
    ...(includeFactors ? { factors: snapshot.factors } : {}),
    computedAt: snapshot.computedAt.toISOString(),
  }
}

export function createCreditScoreRouter(): Router {
  const router = Router()

  router.get('/my', authenticateToken, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.user?.id
      if (!tenantId) {
        throw new AppError(ErrorCode.UNAUTHORIZED, 401, 'Authentication required')
      }

      const snapshot = await creditScoreService.getLatestSnapshot(tenantId)
      if (!snapshot) {
        throw new AppError(ErrorCode.NO_SCORE_YET, 404, 'No credit score is available yet')
      }

      res.json({
        ...serializeSnapshot(snapshot),
        tips: creditScoreService.generateImprovementTips(snapshot),
      })
    } catch (error) {
      next(error)
    }
  })

  router.get('/my/history', authenticateToken, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.user?.id
      if (!tenantId) {
        throw new AppError(ErrorCode.UNAUTHORIZED, 401, 'Authentication required')
      }

      const snapshots = await creditScoreService.getHistory(tenantId)
      res.json({
        history: snapshots.map((snapshot) => serializeSnapshot(snapshot, false)),
      })
    } catch (error) {
      next(error)
    }
  })

  return router
}

export function createAdminCreditScoreRouter(): Router {
  const router = Router()

  router.get('/:tenantId', authenticateToken, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req)
      const snapshot = await creditScoreService.getLatestSnapshot(req.params.tenantId)
      if (!snapshot) {
        throw new AppError(ErrorCode.NO_SCORE_YET, 404, 'No credit score is available yet')
      }

      res.json({
        tenantId: snapshot.userId,
        ...serializeSnapshot(snapshot),
        tips: creditScoreService.generateImprovementTips(snapshot),
      })
    } catch (error) {
      next(error)
    }
  })

  return router
}
