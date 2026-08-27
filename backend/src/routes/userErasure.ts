import { Router, type Response, type NextFunction } from 'express'
import { authenticateToken, type AuthenticatedRequest } from '../middleware/auth.js'
import { AppError } from '../errors/AppError.js'
import { ErrorCode } from '../errors/errorCodes.js'
import { erasureService } from '../services/erasureService.js'
import { getJobStore } from '../jobs/scheduler/store.js'
import { auditLog, extractAuditContext } from '../utils/auditLogger.js'

export function createUserErasureRouter(): Router {
  const router = Router()

  /**
   * POST /api/user/request-erasure
   * Authenticated user requests deletion of their account and personal data.
   * Schedules an ERASURE_REQUESTED job; admin must confirm within 30 days.
   */
  router.post(
    '/request-erasure',
    authenticateToken,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const userId = req.user?.id
        if (!userId) {
          throw new AppError(ErrorCode.UNAUTHORIZED, 401, 'Authentication required')
        }

        let request
        try {
          request = await erasureService.requestErasure(userId)
        } catch (err) {
          if (err instanceof Error && err.message === 'ERASURE_ALREADY_PENDING') {
            throw new AppError(ErrorCode.CONFLICT, 409, 'An erasure request is already pending')
          }
          throw err
        }

        await getJobStore().create({
          name: 'ERASURE_REQUESTED',
          handler: 'erasure.requested',
          payload: { userId, requestId: request.id },
          priority: 3,
          maxRetries: 3,
        })

        auditLog('USER_ERASURE_REQUESTED', extractAuditContext(req, 'user'), {
          requestId: request.id,
          confirmBy: request.confirmBy.toISOString(),
        })

        res.status(202).json({
          message: 'Erasure request submitted. An administrator will confirm within 30 days.',
          requestId: request.id,
          confirmBy: request.confirmBy.toISOString(),
        })
      } catch (error) {
        next(error)
      }
    },
  )

  return router
}
