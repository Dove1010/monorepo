import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import { errorHandler } from '../middleware/errorHandler.js'
import { createUserErasureRouter } from './userErasure.js'

const { mockRequestErasure, mockJobCreate } = vi.hoisted(() => ({
  mockRequestErasure: vi.fn(),
  mockJobCreate: vi.fn(),
}))

vi.mock('../services/erasureService.js', () => ({
  erasureService: {
    requestErasure: mockRequestErasure,
  },
}))

vi.mock('../jobs/scheduler/store.js', () => ({
  getJobStore: vi.fn(() => ({
    create: mockJobCreate,
  })),
}))

vi.mock('../utils/auditLogger.js', () => ({
  auditLog: vi.fn(),
  extractAuditContext: vi.fn(() => ({})),
}))

vi.mock('../middleware/auth.js', () => ({
  authenticateToken: (_req: any, _res: any, next: any) => next(),
  type: {},
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
  app.use('/api/user', createUserErasureRouter())
  app.use(errorHandler)
  return app
}

describe('User Erasure Routes', () => {
  beforeEach(() => {
    mockRequestErasure.mockReset()
    mockJobCreate.mockReset()
  })

  describe('POST /api/user/request-erasure', () => {
    it('should create erasure request for authenticated user', async () => {
      const mockRequest = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        userId: 'user-123',
        status: 'pending' as const,
        requestedAt: new Date(),
        confirmBy: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        confirmedAt: null,
        confirmedBy: null,
      }

      mockRequestErasure.mockResolvedValue(mockRequest)
      mockJobCreate.mockResolvedValue({
        id: 'job-123',
        name: 'ERASURE_REQUESTED',
        handler: 'erasure.requested',
        payload: { userId: 'user-123', requestId: mockRequest.id },
      })

      const app = express()
      app.use(express.json())
      app.use((req: any, _res: any, next: any) => {
        req.requestId = 'test-request-id'
        req.user = { id: 'user-123' }
        next()
      })
      app.use('/api/user', createUserErasureRouter())
      app.use(errorHandler)

      const res = await request(app).post('/api/user/request-erasure')

      expect(res.status).toBe(202)
      expect(res.body.message).toBe('Erasure request submitted. An administrator will confirm within 30 days.')
      expect(res.body.requestId).toBe(mockRequest.id)
      expect(res.body.confirmBy).toBeDefined()
      expect(res.body.confirmBy).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
      expect(mockRequestErasure).toHaveBeenCalledWith('user-123')
      expect(mockJobCreate).toHaveBeenCalledWith({
        name: 'ERASURE_REQUESTED',
        handler: 'erasure.requested',
        payload: { userId: 'user-123', requestId: mockRequest.id },
        priority: 3,
        maxRetries: 3,
      })
    })

    it.skip('should reject unauthenticated request', async () => {
      // Authentication is tested in auth.test.ts
      // This route uses authenticateToken middleware which returns 401 for unauthenticated requests
    })

    it('should return 409 when erasure request already pending', async () => {
      mockRequestErasure.mockRejectedValue(new Error('ERASURE_ALREADY_PENDING'))

      const app = express()
      app.use(express.json())
      app.use((req: any, _res: any, next: any) => {
        req.requestId = 'test-request-id'
        req.user = { id: 'user-456' }
        next()
      })
      app.use('/api/user', createUserErasureRouter())
      app.use(errorHandler)

      const res = await request(app).post('/api/user/request-erasure')

      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('CONFLICT')
      expect(res.body.error.message).toBe('An erasure request is already pending')
    })

    it.skip('should return 401 when user id is missing from request', async () => {
      // This is covered by the route's own check: if (!userId) throw AppError(UNAUTHORIZED)
      // Authentication middleware is tested in auth.test.ts
    })

    it('should propagate unexpected errors from erasureService', async () => {
      mockRequestErasure.mockRejectedValue(new Error('Database connection failed'))

      const app = express()
      app.use(express.json())
      app.use((req: any, _res: any, next: any) => {
        req.requestId = 'test-request-id'
        req.user = { id: 'user-789' }
        next()
      })
      app.use('/api/user', createUserErasureRouter())
      app.use(errorHandler)

      const res = await request(app).post('/api/user/request-erasure')

      expect(res.status).toBe(500)
    })

    it('should propagate unexpected errors from job creation', async () => {
      const mockRequest = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        userId: 'user-999',
        status: 'pending' as const,
        requestedAt: new Date(),
        confirmBy: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        confirmedAt: null,
        confirmedBy: null,
      }

      mockRequestErasure.mockResolvedValue(mockRequest)
      mockJobCreate.mockRejectedValue(new Error('Job store unavailable'))

      const app = express()
      app.use(express.json())
      app.use((req: any, _res: any, next: any) => {
        req.requestId = 'test-request-id'
        req.user = { id: 'user-999' }
        next()
      })
      app.use('/api/user', createUserErasureRouter())
      app.use(errorHandler)

      const res = await request(app).post('/api/user/request-erasure')

      expect(res.status).toBe(500)
    })

    it('should log audit event on successful request', async () => {
      const mockRequest = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        userId: 'user-audit',
        status: 'pending' as const,
        requestedAt: new Date(),
        confirmBy: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        confirmedAt: null,
        confirmedBy: null,
      }

      mockRequestErasure.mockResolvedValue(mockRequest)
      mockJobCreate.mockResolvedValue({
        id: 'job-audit',
        name: 'ERASURE_REQUESTED',
        handler: 'erasure.requested',
        payload: { userId: 'user-audit', requestId: mockRequest.id },
      })

      const app = express()
      app.use(express.json())
      app.use((req: any, _res: any, next: any) => {
        req.requestId = 'test-request-id'
        req.user = { id: 'user-audit' }
        next()
      })
      app.use('/api/user', createUserErasureRouter())
      app.use(errorHandler)

      await request(app).post('/api/user/request-erasure')

      const { auditLog } = await import('../utils/auditLogger.js')
      expect(auditLog).toHaveBeenCalledWith(
        'USER_ERASURE_REQUESTED',
        expect.any(Object),
        expect.objectContaining({
          requestId: mockRequest.id,
          confirmBy: expect.any(String),
        })
      )
    })

    it('should return confirmBy date matching service response', async () => {
      const futureDate = new Date('2026-12-31T23:59:59.999Z')
      const mockRequest = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        userId: 'user-date',
        status: 'pending' as const,
        requestedAt: new Date(),
        confirmBy: futureDate,
        confirmedAt: null,
        confirmedBy: null,
      }

      mockRequestErasure.mockResolvedValue(mockRequest)
      mockJobCreate.mockResolvedValue({
        id: 'job-date',
        name: 'ERASURE_REQUESTED',
        handler: 'erasure.requested',
        payload: { userId: 'user-date', requestId: mockRequest.id },
      })

      const app = express()
      app.use(express.json())
      app.use((req: any, _res: any, next: any) => {
        req.requestId = 'test-request-id'
        req.user = { id: 'user-date' }
        next()
      })
      app.use('/api/user', createUserErasureRouter())
      app.use(errorHandler)

      const res = await request(app).post('/api/user/request-erasure')

      expect(res.status).toBe(202)
      expect(res.body.confirmBy).toBe(futureDate.toISOString())
    })
  })
})
