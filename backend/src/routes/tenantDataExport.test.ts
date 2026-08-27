/**
 * tenantDataExport.test.ts
 * Route coverage for the tenant-facing data export (GDPR-style data-portability)
 * endpoints. Service-level behavior (job lifecycle, cross-tenant scoping, field
 * safety) is already covered in tenantDataExportService.test.ts — this file mocks
 * the service and focuses on HTTP wiring: status codes, response shape, auth
 * guarding, and error propagation.
 *
 * Distinct from the account-erasure cascade in #1539 (a tenant asking for data to
 * be deleted) — this is a tenant asking for a copy of their own data.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express, { type Express } from 'express'
import { errorHandler } from '../middleware/errorHandler.js'
import { createTenantDataExportRouter } from './tenantDataExport.js'

const authState = vi.hoisted(() => ({
  mode: 'authenticated' as 'authenticated' | 'no-token' | 'no-user',
  user: {
    id: 'tenant-1',
    email: 'tenant@example.com',
    name: 'Tenant',
    role: 'tenant' as string,
  },
}))

const serviceMock = vi.hoisted(() => ({
  requestExport: vi.fn(),
  getExportStatus: vi.fn(),
}))

vi.mock('../middleware/auth.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../middleware/auth.js')>()
  const { AppError } = await import('../errors/AppError.js')
  const { ErrorCode } = await import('../errors/errorCodes.js')
  return {
    ...original,
    authenticateToken: (req: any, _res: any, next: any) => {
      if (authState.mode === 'no-token') {
        next(new AppError(ErrorCode.UNAUTHORIZED, 401, 'Authentication token required'))
        return
      }
      if (authState.mode === 'no-user') {
        next()
        return
      }
      req.user = authState.user
      next()
    },
  }
})

vi.mock('../services/tenantDataExportService.js', () => ({
  tenantDataExportService: serviceMock,
}))

function buildApp(): Express {
  const app = express()
  app.use(express.json())
  app.use((req: any, _res, next) => {
    req.requestId = 'test-request-id'
    next()
  })
  app.use('/api/tenant/data-export', createTenantDataExportRouter())
  app.use(errorHandler)
  return app
}

describe('Tenant Data Export Routes', () => {
  beforeEach(() => {
    authState.mode = 'authenticated'
    authState.user = { id: 'tenant-1', email: 'tenant@example.com', name: 'Tenant', role: 'tenant' }
    serviceMock.requestExport.mockReset()
    serviceMock.getExportStatus.mockReset()
  })

  // ---------------------------------------------------------------------------
  // POST /request
  // ---------------------------------------------------------------------------
  describe('POST /request', () => {
    it('returns 202 with jobId, pending status, and a message', async () => {
      serviceMock.requestExport.mockResolvedValue({ id: 'job-123', userId: 'tenant-1', status: 'pending' })

      const res = await request(buildApp()).post('/api/tenant/data-export/request')

      expect(res.status).toBe(202)
      expect(res.body.jobId).toBe('job-123')
      expect(res.body.status).toBe('pending')
      expect(typeof res.body.message).toBe('string')
      expect(res.body.message.length).toBeGreaterThan(0)
    })

    it('calls requestExport with the authenticated user id', async () => {
      serviceMock.requestExport.mockResolvedValue({ id: 'job-123', userId: 'tenant-1', status: 'pending' })

      await request(buildApp()).post('/api/tenant/data-export/request')

      expect(serviceMock.requestExport).toHaveBeenCalledWith('tenant-1')
      expect(serviceMock.requestExport).toHaveBeenCalledTimes(1)
    })

    it('scopes the export to whichever authenticated tenant makes the request', async () => {
      serviceMock.requestExport.mockResolvedValue({ id: 'job-456', userId: 'tenant-2', status: 'pending' })
      authState.user = { id: 'tenant-2', email: 'other@example.com', name: 'Other Tenant', role: 'tenant' }

      await request(buildApp()).post('/api/tenant/data-export/request')

      expect(serviceMock.requestExport).toHaveBeenCalledWith('tenant-2')
    })

    it('rejects an unauthenticated request', async () => {
      authState.mode = 'no-token'

      const res = await request(buildApp()).post('/api/tenant/data-export/request')

      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('UNAUTHORIZED')
      expect(serviceMock.requestExport).not.toHaveBeenCalled()
    })

    it('returns 401 when the session resolves without a user attached', async () => {
      authState.mode = 'no-user'

      const res = await request(buildApp()).post('/api/tenant/data-export/request')

      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('UNAUTHORIZED')
      expect(res.body.error.message).toBe('Authentication required')
      expect(serviceMock.requestExport).not.toHaveBeenCalled()
    })

    it('propagates a service failure to the error handler', async () => {
      serviceMock.requestExport.mockRejectedValue(new Error('storage unavailable'))

      const res = await request(buildApp()).post('/api/tenant/data-export/request')

      expect(res.status).toBe(500)
    })
  })

  // ---------------------------------------------------------------------------
  // GET /:jobId
  // ---------------------------------------------------------------------------
  describe('GET /:jobId', () => {
    it('returns pending status with no downloadUrl or expiresAt', async () => {
      serviceMock.getExportStatus.mockResolvedValue({ status: 'pending' })

      const res = await request(buildApp()).get('/api/tenant/data-export/job-123')

      expect(res.status).toBe(200)
      expect(res.body.status).toBe('pending')
      expect(res.body.downloadUrl).toBeUndefined()
      expect(res.body.expiresAt).toBeUndefined()
    })

    it('returns ready status with downloadUrl and an ISO-string expiresAt', async () => {
      const expiresAt = new Date('2026-08-29T00:00:00.000Z')
      serviceMock.getExportStatus.mockResolvedValue({
        status: 'ready',
        downloadUrl: 'https://s3.example.com/exports/job-123.zip?expires=1',
        expiresAt,
      })

      const res = await request(buildApp()).get('/api/tenant/data-export/job-123')

      expect(res.status).toBe(200)
      expect(res.body.status).toBe('ready')
      expect(res.body.downloadUrl).toBe('https://s3.example.com/exports/job-123.zip?expires=1')
      expect(res.body.expiresAt).toBe(expiresAt.toISOString())
    })

    it('calls getExportStatus with the jobId param and authenticated user id', async () => {
      serviceMock.getExportStatus.mockResolvedValue({ status: 'pending' })

      await request(buildApp()).get('/api/tenant/data-export/job-abc')

      expect(serviceMock.getExportStatus).toHaveBeenCalledWith('job-abc', 'tenant-1')
    })

    it('returns 404 when the job does not exist', async () => {
      serviceMock.getExportStatus.mockResolvedValue(null)

      const res = await request(buildApp()).get('/api/tenant/data-export/does-not-exist')

      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe('NOT_FOUND')
    })

    it('returns 404 when the job belongs to a different tenant (no cross-tenant leak)', async () => {
      // The service itself scopes by userId and returns null on a mismatch —
      // this test guards that the route surfaces that as a plain 404, not the
      // other tenant's data.
      serviceMock.getExportStatus.mockResolvedValue(null)

      const res = await request(buildApp()).get('/api/tenant/data-export/someone-elses-job')

      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe('NOT_FOUND')
      expect(serviceMock.getExportStatus).toHaveBeenCalledWith('someone-elses-job', 'tenant-1')
    })

    it('rejects an unauthenticated request', async () => {
      authState.mode = 'no-token'

      const res = await request(buildApp()).get('/api/tenant/data-export/job-123')

      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('UNAUTHORIZED')
      expect(serviceMock.getExportStatus).not.toHaveBeenCalled()
    })

    it('returns 401 when the session resolves without a user attached', async () => {
      authState.mode = 'no-user'

      const res = await request(buildApp()).get('/api/tenant/data-export/job-123')

      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('UNAUTHORIZED')
      expect(res.body.error.message).toBe('Authentication required')
      expect(serviceMock.getExportStatus).not.toHaveBeenCalled()
    })

    it('propagates a service failure to the error handler', async () => {
      serviceMock.getExportStatus.mockRejectedValue(new Error('db unavailable'))

      const res = await request(buildApp()).get('/api/tenant/data-export/job-123')

      expect(res.status).toBe(500)
    })
  })
})
