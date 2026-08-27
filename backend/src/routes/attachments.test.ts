import { describe, it, expect, beforeEach, vi } from 'vitest'
import request from 'supertest'
import express from 'express'
import { createAttachmentsRouter } from './attachments.js'
import { AppError } from '../errors/AppError.js'
import { ErrorCode } from '../errors/errorCodes.js'
import { errorHandler } from '../middleware/errorHandler.js'

vi.mock('../middleware/auth.js', () => ({
  authenticateToken: (req: any, _res: any, next: any) => {
    req.user = { id: req.headers['x-user-id'] || 'test-user' }
    next()
  },
}))

function createTestApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/messaging/attachments', createAttachmentsRouter())
  app.use(errorHandler)
  return app
}

describe('Attachments API', () => {
  let app: express.Application

  beforeEach(async () => {
    app = createTestApp()
  })

  describe('POST /api/messaging/attachments/upload-url', () => {
    it('should return a presigned upload URL for valid requests', async () => {
      const res = await request(app)
        .post('/api/messaging/attachments/upload-url')
        .set('x-user-id', 'test-user')
        .send({
          contentType: 'image/jpeg',
          fileSizeBytes: 1024,
          fileName: 'photo.jpg',
        })
        .expect(201)

      expect(res.body.success).toBe(true)
      expect(res.body.data.uploadUrl).toBeDefined()
      expect(res.body.data.storageKey).toContain('message-attachments/')
      expect(res.body.data.expiresAt).toBeDefined()
    })

    it('should reject unsupported content types', async () => {
      await request(app)
        .post('/api/messaging/attachments/upload-url')
        .set('x-user-id', 'test-user')
        .send({
          contentType: 'application/x-msdownload',
          fileSizeBytes: 1024,
          fileName: 'virus.exe',
        })
        .expect(400)
    })

    it('should reject oversized files', async () => {
      await request(app)
        .post('/api/messaging/attachments/upload-url')
        .set('x-user-id', 'test-user')
        .send({
          contentType: 'image/jpeg',
          fileSizeBytes: 20 * 1024 * 1024,
          fileName: 'large.jpg',
        })
        .expect(400)
    })
  })
})
