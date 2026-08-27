import { Router, type Request, type Response, type NextFunction } from 'express'
import { validate } from '../middleware/validate.js'
import { createPropertyIssueReportSchema } from '../schemas/propertyIssueReport.js'
import { propertyIssueReportStore } from '../models/propertyIssueReportStore.js'

export function createPropertyIssueReportsRouter(): Router {
  const router = Router()

  /**
   * POST /api/property-issue-reports
   * Public issue reporting intake from property detail page.
   */
  router.post(
    '/',
    validate(createPropertyIssueReportSchema, 'body'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { propertyId, category, details } = req.body as any

        const forwardedFor = req.headers['x-forwarded-for']
        const ip =
          typeof forwardedFor === 'string'
            ? forwardedFor.split(',')[0]?.trim()
            : Array.isArray(forwardedFor)
              ? forwardedFor[0]
              : req.ip

        const userAgent =
          typeof req.headers['user-agent'] === 'string'
            ? req.headers['user-agent']
            : undefined

        const saved = await propertyIssueReportStore.create({
          propertyId,
          category,
          details,
          ip,
          userAgent,
        })

        res.status(201).json({
          success: true,
          reportId: saved.reportId,
        })
      } catch (error) {
        next(error)
      }
    },
  )

  return router
}

