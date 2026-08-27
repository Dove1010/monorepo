import { describe, it, expect, beforeEach, vi } from 'vitest'
import request from 'supertest'
import express from 'express'
import { createMessagingRouter } from './messaging.js'
import { conversationStore } from '../models/conversationStore.js'
import { errorHandler } from '../middleware/errorHandler.js'
import * as messageNotificationService from '../services/messageNotificationService.js'

vi.mock('../middleware/auth.js', () => ({
  authenticateToken: (req: any, _res: any, next: any) => {
    req.user = { id: req.headers['x-user-id'] || 'test-user' }
    next()
  },
}))

vi.mock('../services/messageNotificationService.js', () => ({
  queueMessageNotificationsSafely: vi.fn().mockResolvedValue(undefined),
}))

function createTestApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/messaging', createMessagingRouter())
  app.use(errorHandler)
  return app
}

describe('Messaging API', () => {
  let app: express.Application

  beforeEach(async () => {
    await conversationStore.clear()
    app = createTestApp()
  })

  const userA = 'user-a'
  const userB = 'user-b'

  describe('POST /api/messaging/conversations', () => {
    it('should create a conversation between participants', async () => {
      const res = await request(app)
        .post('/api/messaging/conversations')
        .set('x-user-id', userA)
        .send({ participantIds: [userB] })
        .expect(201)

      expect(res.body.success).toBe(true)
      expect(res.body.data.id).toBeDefined()
      expect(res.body.data.participants).toHaveLength(2)
    })

    it('should be idempotent - same participants returns same conversation', async () => {
      const res1 = await request(app)
        .post('/api/messaging/conversations')
        .set('x-user-id', userA)
        .send({ participantIds: [userB] })
        .expect(201)

      const res2 = await request(app)
        .post('/api/messaging/conversations')
        .set('x-user-id', userA)
        .send({ participantIds: [userB] })
        .expect(201)

      expect(res1.body.data.id).toBe(res2.body.data.id)
    })

    it('should include the caller as a participant', async () => {
      const res = await request(app)
        .post('/api/messaging/conversations')
        .set('x-user-id', userA)
        .send({ participantIds: [userB] })
        .expect(201)

      const participantIds = res.body.data.participants.map((p: any) => p.userId)
      expect(participantIds).toContain(userA)
      expect(participantIds).toContain(userB)
    })
  })

  describe('GET /api/messaging/conversations', () => {
    it('should list the caller conversations', async () => {
      await request(app)
        .post('/api/messaging/conversations')
        .set('x-user-id', userA)
        .send({ participantIds: [userB] })

      const res = await request(app)
        .get('/api/messaging/conversations')
        .set('x-user-id', userA)
        .expect(200)

      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveLength(1)
    })

    it('should not show conversations the caller is not in', async () => {
      await request(app)
        .post('/api/messaging/conversations')
        .set('x-user-id', userA)
        .send({ participantIds: [userB] })

      const res = await request(app)
        .get('/api/messaging/conversations')
        .set('x-user-id', 'user-c')
        .expect(200)

      expect(res.body.data).toHaveLength(0)
    })
  })

  describe('POST /api/messaging/conversations/:id/messages', () => {
    it('should send a message to a conversation', async () => {
      const conv = await request(app)
        .post('/api/messaging/conversations')
        .set('x-user-id', userA)
        .send({ participantIds: [userB] })

      const res = await request(app)
        .post(`/api/messaging/conversations/${conv.body.data.id}/messages`)
        .set('x-user-id', userA)
        .send({ body: 'Hello!' })
        .expect(201)

      expect(res.body.success).toBe(true)
      expect(res.body.data.body).toBe('Hello!')
      expect(res.body.data.senderId).toBe(userA)
    })

    it('should reject messages from non-participants with 404', async () => {
      const conv = await request(app)
        .post('/api/messaging/conversations')
        .set('x-user-id', userA)
        .send({ participantIds: [userB] })

      await request(app)
        .post(`/api/messaging/conversations/${conv.body.data.id}/messages`)
        .set('x-user-id', 'user-c')
        .send({ body: 'Hello!' })
        .expect(404)
    })

    it('still sends the message when notification queueing fails', async () => {
      vi.mocked(
        messageNotificationService.queueMessageNotificationsSafely,
      ).mockRejectedValueOnce(new Error('queue failed'))

      const conv = await request(app)
        .post('/api/messaging/conversations')
        .set('x-user-id', userA)
        .send({ participantIds: [userB] })

      const res = await request(app)
        .post(`/api/messaging/conversations/${conv.body.data.id}/messages`)
        .set('x-user-id', userA)
        .send({ body: 'Hello despite notification failure' })
        .expect(201)

      expect(res.body.success).toBe(true)
      expect(res.body.data.body).toBe('Hello despite notification failure')
    })
  })

  describe('GET /api/messaging/conversations/:id/messages', () => {
    it('should return paginated messages', async () => {
      const conv = await request(app)
        .post('/api/messaging/conversations')
        .set('x-user-id', userA)
        .send({ participantIds: [userB] })

      await request(app)
        .post(`/api/messaging/conversations/${conv.body.data.id}/messages`)
        .set('x-user-id', userA)
        .send({ body: 'First' })

      await request(app)
        .post(`/api/messaging/conversations/${conv.body.data.id}/messages`)
        .set('x-user-id', userB)
        .send({ body: 'Second' })

      const res = await request(app)
        .get(`/api/messaging/conversations/${conv.body.data.id}/messages`)
        .set('x-user-id', userA)
        .expect(200)

      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveLength(2)
    })

    it('should deny access to non-participants with 404', async () => {
      const conv = await request(app)
        .post('/api/messaging/conversations')
        .set('x-user-id', userA)
        .send({ participantIds: [userB] })

      await request(app)
        .get(`/api/messaging/conversations/${conv.body.data.id}/messages`)
        .set('x-user-id', 'user-c')
        .expect(404)
    })
  })

  describe('POST /api/messaging/conversations/:id/read', () => {
    it('should mark messages as read and update unread count', async () => {
      const conv = await request(app)
        .post('/api/messaging/conversations')
        .set('x-user-id', userA)
        .send({ participantIds: [userB] })

      await request(app)
        .post(`/api/messaging/conversations/${conv.body.data.id}/messages`)
        .set('x-user-id', userB)
        .send({ body: 'New message' })

      const unreadBefore = await request(app)
        .get('/api/messaging/unread-count')
        .set('x-user-id', userA)

      expect(unreadBefore.body.data.unread).toBe(1)

      await request(app)
        .post(`/api/messaging/conversations/${conv.body.data.id}/read`)
        .set('x-user-id', userA)
        .expect(200)

      const unreadAfter = await request(app)
        .get('/api/messaging/unread-count')
        .set('x-user-id', userA)

      expect(unreadAfter.body.data.unread).toBe(0)
    })
  })

  describe('GET /api/messaging/unread-count', () => {
    it('should return zero for a user with no conversations', async () => {
      const res = await request(app)
        .get('/api/messaging/unread-count')
        .set('x-user-id', userA)
        .expect(200)

      expect(res.body.data.unread).toBe(0)
    })

    it('should reflect new inbound messages', async () => {
      const conv = await request(app)
        .post('/api/messaging/conversations')
        .set('x-user-id', userA)
        .send({ participantIds: [userB] })

      await request(app)
        .post(`/api/messaging/conversations/${conv.body.data.id}/messages`)
        .set('x-user-id', userB)
        .send({ body: 'Inbound message' })

      const res = await request(app)
        .get('/api/messaging/unread-count')
        .set('x-user-id', userA)
        .expect(200)

      expect(res.body.data.unread).toBe(1)
    })

    it('should not count own messages as unread', async () => {
      const conv = await request(app)
        .post('/api/messaging/conversations')
        .set('x-user-id', userA)
        .send({ participantIds: [userB] })

      await request(app)
        .post(`/api/messaging/conversations/${conv.body.data.id}/messages`)
        .set('x-user-id', userA)
        .send({ body: 'Own message' })

      const res = await request(app)
        .get('/api/messaging/unread-count')
        .set('x-user-id', userA)
        .expect(200)

      expect(res.body.data.unread).toBe(0)
    })
  })
})
