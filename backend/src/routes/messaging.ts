import { Router, Request, Response } from "express"
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js"
import { sessionStore } from "../models/authStore.js"
import {
  createStreamSession,
  cleanupDisconnectedStream,
  getActiveStreamCount,
} from "../services/messagingStreamService.js"
import { AppError, notFound, unauthorized } from "../errors/AppError.js"
import { ErrorCode } from "../errors/errorCodes.js"
import { logger } from "../utils/logger.js"
import { conversationStore } from "../models/conversationStore.js"
import { queueMessageNotificationsSafely } from "../services/messageNotificationService.js"
import {
  createConversationSchema,
  sendMessageSchema,
  conversationFiltersSchema,
  messageQuerySchema,
  type CreateConversationRequest,
  type SendMessageRequest,
} from "../schemas/messaging.js"
import { idempotency } from "../middleware/idempotency.js"
import { createRateLimiter } from "../middleware/rateLimiter.js"
import { rateLimitProfiles } from "../config/rateLimitConfig.js"

// Lightweight auth middleware for SSE — checks both header and query param.
async function sseAuth(req: AuthenticatedRequest, _res: Response, next: Function) {
  try {
    const authHeader = req.headers.authorization
    const queryToken = req.query.token as string | undefined
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : queryToken

    if (!token) {
      next(new AppError(ErrorCode.UNAUTHORIZED, 401, "Authentication token required"))
      return
    }

    const session = await sessionStore.getByToken(token)
    if (!session) {
      next(new AppError(ErrorCode.UNAUTHORIZED, 401, "Invalid token"))
      return
    }

    req.user = {
      id: session.email,
      email: session.email,
      name: session.email.split("@")[0] || "User",
      role: "tenant",
    }
    next()
  } catch (err) {
    next(err)
  }
}

function requireUser(req: AuthenticatedRequest): string {
  const userId = req.user?.id
  if (!userId) {
    throw unauthorized()
  }
  return userId
}

export function createMessagingRouter(): Router {
  const router = Router()

  router.get(
    "/stream",
    sseAuth,
    (req: AuthenticatedRequest, res: Response) => {
      const userId = req.user!.id

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      })

      res.write(`event: connected\ndata: ${JSON.stringify({ userId, timestamp: Date.now() })}\n\n`)

      const { success, client } = createStreamSession(userId, res)
      if (!success) {
        logger.warn("SSE stream limit reached for user", { userId })
        res.write(`event: error\ndata: ${JSON.stringify({ message: "Too many concurrent streams. Close another tab and retry." })}\n\n`)
        res.end()
        return
      }

      logger.info("SSE stream opened", {
        userId,
        activeStreams: getActiveStreamCount(),
      })

      req.on("close", () => {
        cleanupDisconnectedStream(res)
        logger.info("SSE stream closed", {
          userId,
          activeStreams: getActiveStreamCount(),
        })
      })

      req.on("error", () => {
        cleanupDisconnectedStream(res)
      })
    },
  )

  router.get(
    "/stream/health",
    (_req: Request, res: Response) => {
      res.json({ activeStreams: getActiveStreamCount() })
    },
  )

  router.get("/conversations", authenticateToken, async (req: AuthenticatedRequest, res: Response, next) => {
    try {
      const userId = requireUser(req)
      const filters = conversationFiltersSchema.parse(req.query)
      const result = await conversationStore.listConversations(userId, filters)
      res.json({ success: true, data: result.items, nextCursor: result.nextCursor })
    } catch (error) {
      if (error instanceof Error && error.name === 'ZodError') {
        return next(new AppError(ErrorCode.VALIDATION_ERROR, 400, error.message))
      }
      next(error)
    }
  })

  router.post("/conversations", authenticateToken, idempotency(), async (req: AuthenticatedRequest, res: Response, next) => {
    try {
      const userId = requireUser(req)
      const data: CreateConversationRequest = createConversationSchema.parse(req.body)
      const participantIds = [...new Set([userId, ...data.participantIds])]
      const conversation = await conversationStore.findOrCreateConversation({
        participantIds,
        subjectType: data.subjectType,
        subjectId: data.subjectId,
      })
      res.status(201).json({ success: true, data: conversation })
    } catch (error) {
      if (error instanceof Error && error.name === 'ZodError') {
        return next(new AppError(ErrorCode.VALIDATION_ERROR, 400, error.message))
      }
      next(error)
    }
  })

  router.get("/conversations/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response, next) => {
    try {
      const userId = requireUser(req)
      const conversation = await conversationStore.getConversation(req.params.id, userId)
      if (!conversation) {
        throw notFound('Conversation')
      }
      res.json({ success: true, data: conversation })
    } catch (error) {
      next(error)
    }
  })

  router.get("/conversations/:id/messages", authenticateToken, async (req: AuthenticatedRequest, res: Response, next) => {
    try {
      const userId = requireUser(req)
      const isParticipant = await conversationStore.isParticipant(req.params.id, userId)
      if (!isParticipant) {
        throw notFound('Conversation')
      }
      const query = messageQuerySchema.parse(req.query)
      const result = await conversationStore.getMessages(req.params.id, userId, query.cursor, query.limit)
      res.json({ success: true, data: result.items, nextCursor: result.nextCursor })
    } catch (error) {
      if (error instanceof Error && error.name === 'ZodError') {
        return next(new AppError(ErrorCode.VALIDATION_ERROR, 400, error.message))
      }
      next(error)
    }
  })

  const messageRateLimit = createRateLimiter({ ...rateLimitProfiles.messaging, keyPrefix: 'rl:msg_send' })

  router.post("/conversations/:id/messages", authenticateToken, messageRateLimit, idempotency(), async (req: AuthenticatedRequest, res: Response, next) => {
    try {
      const userId = requireUser(req)
      const isParticipant = await conversationStore.isParticipant(req.params.id, userId)
      if (!isParticipant) {
        throw notFound('Conversation')
      }
      const data: SendMessageRequest = sendMessageSchema.parse(req.body)
      const message = await conversationStore.sendMessage({
        conversationId: req.params.id,
        senderId: userId,
        body: data.body,
        attachment: data.attachment,
      })
      void queueMessageNotificationsSafely({
        conversationId: req.params.id,
        senderId: userId,
        body: data.body,
        createdAt: message.createdAt,
      }).catch((notificationError) => {
        logger.error('Failed to queue message notifications', {
          conversationId: req.params.id,
          error:
            notificationError instanceof Error
              ? notificationError.message
              : String(notificationError),
        })
      })
      res.status(201).json({ success: true, data: message })
    } catch (error) {
      if (error instanceof Error && error.name === 'ZodError') {
        return next(new AppError(ErrorCode.VALIDATION_ERROR, 400, error.message))
      }
      next(error)
    }
  })

  router.post("/conversations/:id/read", authenticateToken, async (req: AuthenticatedRequest, res: Response, next) => {
    try {
      const userId = requireUser(req)
      const isParticipant = await conversationStore.isParticipant(req.params.id, userId)
      if (!isParticipant) {
        throw notFound('Conversation')
      }
      await conversationStore.markRead(req.params.id, userId)
      res.json({ success: true })
    } catch (error) {
      next(error)
    }
  })

  router.get("/unread-count", authenticateToken, async (req: AuthenticatedRequest, res: Response, next) => {
    try {
      const userId = requireUser(req)
      const count = await conversationStore.getUnreadCount(userId)
      res.json({ success: true, data: { unread: count } })
    } catch (error) {
      next(error)
    }
  })

  return router
}
