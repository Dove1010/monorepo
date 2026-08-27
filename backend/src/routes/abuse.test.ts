import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import { errorHandler } from '../middleware/errorHandler.js'
import { createAbuseRouter } from './abuse.js'
import { abuseEventStore } from '../services/abuseDetectionService.js'

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
  app.use('/api/admin/abuse', createAbuseRouter())
  app.use(errorHandler)
  return app
}

describe('Abuse Routes', () => {
  beforeEach(() => {
    abuseEventStore.clear()
  })

  describe('GET /api/admin/abuse/events', () => {
    it('should return paginated abuse events for admin user', async () => {
      const app = express()
      app.use(express.json())
      app.use((req: any, _res: any, next: any) => {
        req.requestId = 'test-request-id'
        req.user = { id: 'admin-123', role: 'admin' }
        next()
      })
      app.use('/api/admin/abuse', createAbuseRouter())
      app.use(errorHandler)

      // Add some test events
      abuseEventStore.add({
        target: '192.168.1.1',
        type: 'credential_stuffing',
        expiresAt: new Date(Date.now() + 3600000),
      })
      abuseEventStore.add({
        target: 'user-456',
        type: 'deal_spam',
        expiresAt: new Date(Date.now() + 3600000),
      })

      const res = await request(app).get('/api/admin/abuse/events?page=1&pageSize=10')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.events).toBeInstanceOf(Array)
      expect(res.body.events.length).toBe(2)
      expect(res.body.pagination).toBeDefined()
      expect(res.body.pagination.total).toBe(2)
      expect(res.body.pagination.page).toBe(1)
      expect(res.body.pagination.pageSize).toBe(10)
      expect(res.body.pagination.totalPages).toBe(1)
    })

    it('should reject request from non-admin user', async () => {
      const app = express()
      app.use(express.json())
      app.use((req: any, _res: any, next: any) => {
        req.requestId = 'test-request-id'
        req.user = { id: 'tenant-123', role: 'tenant' }
        next()
      })
      app.use('/api/admin/abuse', createAbuseRouter())
      app.use(errorHandler)

      const res = await request(app).get('/api/admin/abuse/events')

      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe('FORBIDDEN')
      expect(res.body.error.message).toBe('Admin role required')
    })

    it('should reject request from unauthenticated user', async () => {
      const app = express()
      app.use(express.json())
      app.use((req: any, _res: any, next: any) => {
        req.requestId = 'test-request-id'
        // No user object
        next()
      })
      app.use('/api/admin/abuse', createAbuseRouter())
      app.use(errorHandler)

      const res = await request(app).get('/api/admin/abuse/events')

      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('UNAUTHORIZED')
      expect(res.body.error.message).toBe('Authentication required')
    })

    it('should allow super_admin role', async () => {
      const app = express()
      app.use(express.json())
      app.use((req: any, _res: any, next: any) => {
        req.requestId = 'test-request-id'
        req.user = { id: 'super-admin-123', role: 'super_admin' }
        next()
      })
      app.use('/api/admin/abuse', createAbuseRouter())
      app.use(errorHandler)

      const res = await request(app).get('/api/admin/abuse/events')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })

    it('should return empty events array when no events exist', async () => {
      const app = express()
      app.use(express.json())
      app.use((req: any, _res: any, next: any) => {
        req.requestId = 'test-request-id'
        req.user = { id: 'admin-123', role: 'admin' }
        next()
      })
      app.use('/api/admin/abuse', createAbuseRouter())
      app.use(errorHandler)

      const res = await request(app).get('/api/admin/abuse/events')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.events).toEqual([])
      expect(res.body.pagination.total).toBe(0)
    })

    it('should handle pagination with default values', async () => {
      const app = express()
      app.use(express.json())
      app.use((req: any, _res: any, next: any) => {
        req.requestId = 'test-request-id'
        req.user = { id: 'admin-123', role: 'admin' }
        next()
      })
      app.use('/api/admin/abuse', createAbuseRouter())
      app.use(errorHandler)

      const res = await request(app).get('/api/admin/abuse/events')

      expect(res.status).toBe(200)
      expect(res.body.pagination.page).toBe(1)
      expect(res.body.pagination.pageSize).toBe(20)
    })

    it('should validate page parameter - minimum 1', async () => {
      const app = express()
      app.use(express.json())
      app.use((req: any, _res: any, next: any) => {
        req.requestId = 'test-request-id'
        req.user = { id: 'admin-123', role: 'admin' }
        next()
      })
      app.use('/api/admin/abuse', createAbuseRouter())
      app.use(errorHandler)

      const res = await request(app).get('/api/admin/abuse/events?page=0')

      expect(res.status).toBe(200)
      expect(res.body.pagination.page).toBe(1) // Clamped to minimum 1
    })

    it('should validate pageSize parameter - maximum 100', async () => {
      const app = express()
      app.use(express.json())
      app.use((req: any, _res: any, next: any) => {
        req.requestId = 'test-request-id'
        req.user = { id: 'admin-123', role: 'admin' }
        next()
      })
      app.use('/api/admin/abuse', createAbuseRouter())
      app.use(errorHandler)

      const res = await request(app).get('/api/admin/abuse/events?pageSize=200')

      expect(res.status).toBe(200)
      expect(res.body.pagination.pageSize).toBe(100) // Clamped to maximum 100
    })

    it('should return event with correct structure', async () => {
      const app = express()
      app.use(express.json())
      app.use((req: any, _res: any, next: any) => {
        req.requestId = 'test-request-id'
        req.user = { id: 'admin-123', role: 'admin' }
        next()
      })
      app.use('/api/admin/abuse', createAbuseRouter())
      app.use(errorHandler)

      const testEvent = abuseEventStore.add({
        target: '192.168.1.100',
        type: 'scraping',
        expiresAt: new Date(Date.now() + 7200000),
      })

      const res = await request(app).get('/api/admin/abuse/events')

      expect(res.status).toBe(200)
      expect(res.body.events[0]).toMatchObject({
        id: testEvent.id,
        target: '192.168.1.100',
        type: 'scraping',
      })
      expect(res.body.events[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
      expect(res.body.events[0].expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    })

    it('should exclude expired events from results', async () => {
      const app = express()
      app.use(express.json())
      app.use((req: any, _res: any, next: any) => {
        req.requestId = 'test-request-id'
        req.user = { id: 'admin-123', role: 'admin' }
        next()
      })
      app.use('/api/admin/abuse', createAbuseRouter())
      app.use(errorHandler)

      // Add expired event
      abuseEventStore.add({
        target: '192.168.1.200',
        type: 'credential_stuffing',
        expiresAt: new Date(Date.now() - 1000), // Expired
      })

      // Add active event
      abuseEventStore.add({
        target: '192.168.1.201',
        type: 'credential_stuffing',
        expiresAt: new Date(Date.now() + 3600000),
      })

      const res = await request(app).get('/api/admin/abuse/events')

      expect(res.status).toBe(200)
      expect(res.body.events.length).toBe(1)
      expect(res.body.events[0].target).toBe('192.168.1.201')
    })
  })
})
