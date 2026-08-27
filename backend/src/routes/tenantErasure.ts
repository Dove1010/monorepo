import { Router, type Response, type NextFunction } from 'express'
import { authenticateToken, type AuthenticatedRequest } from '../middleware/auth.js'
import { AppError } from '../errors/AppError.js'
import { ErrorCode } from '../errors/errorCodes.js'
import { logger } from '../utils/logger.js'

/**
 * In-memory erasure request store for tenant NDPA compliance.
 * No DB migration required; the canonical erasure flow (admin confirmation,
 * PII scrubbing) is handled separately by ErasureService + /api/v1/user/request-erasure.
 */

const ERASURE_CONFIRM_DAYS = 30

interface TenantErasureRequest {
  id: string
  userId: string
  status: 'pending_review'
  createdAt: Date
  confirmBy: Date
}

const erasureRequests = new Map<string, TenantErasureRequest>()

/**
 * Stub: check whether the tenant has an active deal that would block erasure.
 * Returns false (no active deal) until deal-check logic is wired in.
 */
function hasActiveDeal(_userId: string): boolean {
  return false
}

export function createTenantErasureRouter(): Router {
  const router = Router()

  /**
   * POST /request
   * Tenant submits a Right-to-Erasure request under NDPA.
   *
   * Blocked if the tenant has an active rental deal (data must be retained for
   * the duration of the tenancy for legal and financial compliance).
   *
   * Returns 202 with a reference ID and the review deadline.
   */
  router.post(
    '/request',
    authenticateToken,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const userId = req.user?.id
        if (!userId) {
          throw new AppError(ErrorCode.UNAUTHORIZED, 401, 'Authentication required')
        }

        if (hasActiveDeal(userId)) {
          throw new AppError(
            ErrorCode.CONFLICT,
            409,
            'Your erasure request cannot be processed while you have an active rental deal. ' +
              'Please wait until all active deals are concluded before requesting erasure.',
          )
        }

        const confirmBy = new Date(Date.now() + ERASURE_CONFIRM_DAYS * 24 * 60 * 60 * 1000)
        const request: TenantErasureRequest = {
          id: crypto.randomUUID(),
          userId,
          status: 'pending_review',
          createdAt: new Date(),
          confirmBy,
        }
        erasureRequests.set(request.id, request)

        // Notify compliance team (stub: log only; replace with outbox/email in production).
        logger.info('tenantErasure.requested', {
          requestId: request.id,
          userId,
          confirmBy: confirmBy.toISOString(),
        })

        res.status(202).json({
          requestId: request.id,
          message:
            'Your Right-to-Erasure request has been received and is under review. ' +
            'A compliance officer will process it within 30 days.',
          confirmBy: confirmBy.toISOString(),
        })
      } catch (error) {
        next(error)
      }
    },
  )

  return router
}
