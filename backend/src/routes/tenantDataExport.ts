import { Router, type Response, type NextFunction } from 'express'
import { authenticateToken, type AuthenticatedRequest } from '../middleware/auth.js'
import { AppError } from '../errors/AppError.js'
import { ErrorCode } from '../errors/errorCodes.js'
import { tenantDataExportService } from '../services/tenantDataExportService.js'

export function createTenantDataExportRouter(): Router {
  const router = Router()

  /**
   * POST /request
   * Authenticated tenant requests a copy of all personal data held by the platform.
   * Returns 202 immediately; the export is generated asynchronously.
   * Poll GET /:jobId to check when the download link is ready.
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

        const job = await tenantDataExportService.requestExport(userId)

        res.status(202).json({
          jobId: job.id,
          status: 'pending',
          message:
            'Your data export is being prepared. Use the jobId to poll for status and retrieve the download link once ready.',
        })
      } catch (error) {
        next(error)
      }
    },
  )

  /**
   * GET /:jobId
   * Poll the status of a previously requested data export.
   * Returns the download URL once the job is in "ready" status.
   */
  router.get(
    '/:jobId',
    authenticateToken,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const userId = req.user?.id
        if (!userId) {
          throw new AppError(ErrorCode.UNAUTHORIZED, 401, 'Authentication required')
        }

        const result = await tenantDataExportService.getExportStatus(req.params.jobId, userId)
        if (!result) {
          throw new AppError(ErrorCode.NOT_FOUND, 404, 'Export job not found')
        }

        res.json({
          status: result.status,
          ...(result.downloadUrl && { downloadUrl: result.downloadUrl }),
          ...(result.expiresAt && { expiresAt: result.expiresAt.toISOString() }),
        })
      } catch (error) {
        next(error)
      }
    },
  )

  return router
}
