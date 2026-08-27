import { Router, type Request, type Response } from 'express'
import { validate } from '../middleware/validate.js'
import { createSupportMessageSchema } from '../schemas/supportMessage.js'
import { supportMessageStore } from '../models/supportMessageStore.js'

export function createSupportRouter(): Router {
  const router = Router()

  /**
   * POST /api/support/messages
   * Public support inquiry intake.
   */
  router.post(
    '/messages',
    validate(createSupportMessageSchema, 'body'),
    async (req: Request, res: Response, next) => {
      try {
        const { name, email, phone, subject, message } = req.body as any

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

        const saved = await supportMessageStore.create({
          name,
          email,
          phone,
          subject,
          message,
          ip,
          userAgent,
        })

        // Stable response (don’t echo user content back)
        res.status(201).json({
          success: true,
          messageId: saved.messageId,
        })
      } catch (err) {
        next(err)
      }
    },
  )

  return router
}

