import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import { errorHandler } from '../middleware/errorHandler.js'
import { createAdminErasureRouter } from './adminErasure.js'

const { mockConfirmErasure } = vi.hoisted(() => ({
  mockConfirmErasure: vi.fn(),
}))

vi.mock('../services/erasureService.js', () => ({
  erasureService: {
    confirmErasure: mockConfirmErasure,
  },
}))

vi.mock('../utils/auditLogger.js', () => ({
  auditLog: vi.fn(),
  extractAuditContext: vi.fn(() => ({})),
}))

vi.mock('../schemas/env.js', () => ({
  env: {
    MANUAL_ADMIN_SECRET: 'test-secret',
  },
}))

vi.mock('../db.js', () => ({
  getPool: vi.fn(async () => null),
  setPool: vi.fn(),
  getPoolMetrics: vi.fn(() => null),
}))

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use((req: any, _res: any, next: any) => {
    req.requestId = 'test-request-id'
    next()
  })
  app.use('/api/admin/erasure', createAdminErasureRouter())
  app.use(errorHandler)
  return app
}

describe('Admin Erasure Routes', () => {
  beforeEach(() => {
    mockConfirmErasure.mockReset()
  })

  describe('POST /api/admin/erasure/:requestId/confirm', () => {
    const validRequestId = '550e8400-e29b-41d4-a716-446655440000'

    it('should confirm erasure with valid admin secret', async () => {
      mockConfirmErasure.mockResolvedValue(undefined)

      const res = await request(buildApp())
        .post(`/api/admin/erasure/${validRequestId}/confirm`)
        .set('x-admin-secret', 'test-secret')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.message).toBe('User data anonymised and account deactivated')
      expect(mockConfirmErasure).toHaveBeenCalledWith(validRequestId, 'admin')
    })

    it('should reject request without admin secret', async () => {
      const res = await request(buildApp())
        .post(`/api/admin/erasure/${validRequestId}/confirm`)

      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe('FORBIDDEN')
      expect(res.body.error.message).toBe('Invalid admin secret')
    })

    it('should reject request with invalid admin secret', async () => {
      const res = await request(buildApp())
        .post(`/api/admin/erasure/${validRequestId}/confirm`)
        .set('x-admin-secret', 'wrong-secret')

      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe('FORBIDDEN')
      expect(res.body.error.message).toBe('Invalid admin secret')
    })

    it('should return 404 when erasure request not found', async () => {
      mockConfirmErasure.mockRejectedValue(new Error('ERASURE_NOT_FOUND'))

      const res = await request(buildApp())
        .post(`/api/admin/erasure/${validRequestId}/confirm`)
        .set('x-admin-secret', 'test-secret')

      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe('NOT_FOUND')
      expect(res.body.error.message).toBe('Erasure request not found')
    })

    it('should return 409 when erasure request is not pending', async () => {
      mockConfirmErasure.mockRejectedValue(new Error('ERASURE_NOT_PENDING'))

      const res = await request(buildApp())
        .post(`/api/admin/erasure/${validRequestId}/confirm`)
        .set('x-admin-secret', 'test-secret')

      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('CONFLICT')
      expect(res.body.error.message).toBe('Erasure request is not pending')
    })

    it('should return 400 for invalid UUID in requestId', async () => {
      const res = await request(buildApp())
        .post('/api/admin/erasure/invalid-uuid/confirm')
        .set('x-admin-secret', 'test-secret')

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('should use authenticated user id when available', async () => {
      mockConfirmErasure.mockResolvedValue(undefined)

      const app = express()
      app.use(express.json())
      app.use((req: any, _res: any, next: any) => {
        req.requestId = 'test-request-id'
        req.user = { id: 'admin-user-123' }
        next()
      })
      app.use('/api/admin/erasure', createAdminErasureRouter())
      app.use(errorHandler)

      const res = await request(app)
        .post(`/api/admin/erasure/${validRequestId}/confirm`)
        .set('x-admin-secret', 'test-secret')

      expect(res.status).toBe(200)
      expect(mockConfirmErasure).toHaveBeenCalledWith(validRequestId, 'admin-user-123')
    })

    it('should propagate unexpected errors', async () => {
      mockConfirmErasure.mockRejectedValue(new Error('Database connection failed'))

      const res = await request(buildApp())
        .post(`/api/admin/erasure/${validRequestId}/confirm`)
        .set('x-admin-secret', 'test-secret')

      expect(res.status).toBe(500)
    })
  })
})
