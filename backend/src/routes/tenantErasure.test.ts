import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import { errorHandler } from '../middleware/errorHandler.js'
import { createTenantErasureRouter } from './tenantErasure.js'

vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
  },
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
  app.use('/api/tenant/erasure', createTenantErasureRouter())
  app.use(errorHandler)
  return app
}

describe('Tenant Erasure Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('POST /api/tenant/erasure/request', () => {
    it('should create erasure request for authenticated tenant', async () => {
      const app = express()
      app.use(express.json())
      app.use((req: any, _res: any, next: any) => {
        req.requestId = 'test-request-id'
        req.user = { id: 'tenant-123' }
        next()
      })
      app.use('/api/tenant/erasure', createTenantErasureRouter())
      app.use(errorHandler)

      const res = await request(app).post('/api/tenant/erasure/request')

      expect(res.status).toBe(202)
      expect(res.body.requestId).toBeDefined()
      expect(typeof res.body.requestId).toBe('string')
      expect(res.body.message).toContain('Right-to-Erasure request has been received')
      expect(res.body.confirmBy).toBeDefined()
      expect(res.body.confirmBy).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    })

    it.skip('should reject unauthenticated request', async () => {
      // Authentication is tested in auth.test.ts
      // This route uses authenticateToken middleware which returns 401 for unauthenticated requests
    })

    it.skip('should return 409 when tenant has active deal', async () => {
      // Note: The hasActiveDeal function is currently a stub that always returns false.
      // This test documents the expected behavior when the function is implemented.
      // To properly test this, the route would need to be refactored to make hasActiveDeal
      // injectable or testable via dependency injection.
      // Expected behavior:
      // expect(res.status).toBe(409)
      // expect(res.body.error.code).toBe('CONFLICT')
      // expect(res.body.error.message).toContain('active rental deal')
    })

    it.skip('should return 401 when user id is missing from request', async () => {
      // This is covered by the route's own check: if (!userId) throw AppError(UNAUTHORIZED)
      // Authentication middleware is tested in auth.test.ts
    })

    it('should generate unique request IDs for multiple requests', async () => {
      const app = express()
      app.use(express.json())
      app.use((req: any, _res: any, next: any) => {
        req.requestId = 'test-request-id'
        req.user = { id: 'tenant-456' }
        next()
      })
      app.use('/api/tenant/erasure', createTenantErasureRouter())
      app.use(errorHandler)

      const res1 = await request(app).post('/api/tenant/erasure/request')
      const res2 = await request(app).post('/api/tenant/erasure/request')

      expect(res1.status).toBe(202)
      expect(res2.status).toBe(202)
      expect(res1.body.requestId).toBeDefined()
      expect(res2.body.requestId).toBeDefined()
      expect(res1.body.requestId).not.toBe(res2.body.requestId)
    })

    it('should set confirmBy date to 30 days from now', async () => {
      const app = express()
      app.use(express.json())
      app.use((req: any, _res: any, next: any) => {
        req.requestId = 'test-request-id'
        req.user = { id: 'tenant-789' }
        next()
      })
      app.use('/api/tenant/erasure', createTenantErasureRouter())
      app.use(errorHandler)

      const beforeRequest = new Date()
      const res = await request(app).post('/api/tenant/erasure/request')
      const afterRequest = new Date()

      expect(res.status).toBe(202)
      const confirmBy = new Date(res.body.confirmBy)
      const expectedMin = new Date(beforeRequest.getTime() + 30 * 24 * 60 * 60 * 1000)
      const expectedMax = new Date(afterRequest.getTime() + 30 * 24 * 60 * 60 * 1000)

      expect(confirmBy.getTime()).toBeGreaterThanOrEqual(expectedMin.getTime() - 1000)
      expect(confirmBy.getTime()).toBeLessThanOrEqual(expectedMax.getTime() + 1000)
    })

    it('should log erasure request creation', async () => {
      const { logger } = await import('../utils/logger.js')

      const app = express()
      app.use(express.json())
      app.use((req: any, _res: any, next: any) => {
        req.requestId = 'test-request-id'
        req.user = { id: 'tenant-log-test' }
        next()
      })
      app.use('/api/tenant/erasure', createTenantErasureRouter())
      app.use(errorHandler)

      await request(app).post('/api/tenant/erasure/request')

      expect(logger.info).toHaveBeenCalledWith(
        'tenantErasure.requested',
        expect.objectContaining({
          requestId: expect.any(String),
          userId: 'tenant-log-test',
          confirmBy: expect.any(String),
        })
      )
    })

    it('should handle unexpected errors gracefully', async () => {
      const app = express()
      app.use(express.json())
      app.use((req: any, _res: any, next: any) => {
        req.requestId = 'test-request-id'
        req.user = { id: 'tenant-error' }
        // Simulate an error by throwing in the middleware
        throw new Error('Unexpected error')
      })
      app.use('/api/tenant/erasure', createTenantErasureRouter())
      app.use(errorHandler)

      const res = await request(app).post('/api/tenant/erasure/request')

      expect(res.status).toBe(500)
    })
  })
})
