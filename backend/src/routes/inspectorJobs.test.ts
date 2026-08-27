import { describe, it, expect, beforeEach, vi } from 'vitest'
import request from 'supertest'
import express from 'express'
import { createInspectorJobsRouter, createAdminInspectorJobsRouter } from './inspectorJobs.js'
import { StubSorobanAdapter } from '../soroban/stub-adapter.js'
import { errorHandler } from '../middleware/errorHandler.js'

vi.mock('../middleware/auth.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../middleware/auth.js')>()
  return {
    ...original,
    authenticateToken: (req: any, _res: any, next: any) => next(),
  }
})

// State management for job lifecycle testing
const jobStateStore = new Map<string, { status: string; claimedBy: string | null; report: unknown }>()

vi.mock('../services/inspectorService.js', async () => {
  const { AppError } = await import('../errors/AppError.js')
  const { ErrorCode } = await import('../errors/errorCodes.js')
  return {
    inspectorService: {
      listAvailableJobs: vi.fn(async () => {
        const available = Array.from(jobStateStore.entries())
          .filter(([, state]) => state.status === 'open' && state.claimedBy === null)
          .map(([id]) => ({ id, status: 'open' }))
        return available
      }),
      claimJob: vi.fn(async (jobId: string, inspectorId: string) => {
        const job = jobStateStore.get(jobId)
        if (!job) {
          throw new AppError(ErrorCode.NOT_FOUND, 404, `Job ${jobId} not found`)
        }
        if (job.claimedBy !== null && job.claimedBy !== inspectorId) {
          throw new AppError(ErrorCode.CONFLICT, 409, `Job ${jobId} already claimed by another inspector`)
        }
        if (job.status !== 'open') {
          throw new AppError(ErrorCode.VALIDATION_ERROR, 400, `Job ${jobId} is not open`)
        }
        job.claimedBy = inspectorId
        job.status = 'claimed'
        return { id: jobId, status: 'claimed', claimedBy: inspectorId }
      }),
      submitReport: vi.fn(async (jobId: string, inspectorId: string, reportData: any) => {
        const job = jobStateStore.get(jobId)
        if (!job) {
          throw new AppError(ErrorCode.NOT_FOUND, 404, `Job ${jobId} not found`)
        }
        if (job.claimedBy !== inspectorId) {
          throw new AppError(ErrorCode.VALIDATION_ERROR, 400, `Job ${jobId} was not claimed by inspector ${inspectorId}`)
        }
        if (job.status !== 'claimed') {
          throw new AppError(ErrorCode.VALIDATION_ERROR, 400, `Job ${jobId} is not in claimed state`)
        }
        job.status = 'reported'
        job.report = reportData
        return { job: { id: jobId, status: 'reported' }, report: reportData }
      }),
      listAllJobs: vi.fn(async () => {
        return Array.from(jobStateStore.entries()).map(([id, state]) => ({
          id,
          ...state,
        }))
      }),
      createJob: vi.fn(async (jobData: any) => {
        const jobId = `job-${Date.now()}`
        jobStateStore.set(jobId, {
          status: 'open',
          claimedBy: null,
          report: null,
        })
        return { id: jobId, ...jobData }
      }),
      approveReport: vi.fn(async (jobId: string) => {
        const job = jobStateStore.get(jobId)
        if (!job) {
          throw new AppError(ErrorCode.NOT_FOUND, 404, `Job ${jobId} not found`)
        }
        if (job.status !== 'reported') {
          throw new AppError(ErrorCode.VALIDATION_ERROR, 400, `Job ${jobId} is not in reported state`)
        }
        if (job.status === 'approved') {
          throw new AppError(ErrorCode.VALIDATION_ERROR, 400, `Job ${jobId} already approved`)
        }
        job.status = 'approved'
        return { id: jobId, status: 'approved' }
      }),
      rejectReport: vi.fn(async (jobId: string, reason: string) => {
        const job = jobStateStore.get(jobId)
        if (!job) {
          throw new AppError(ErrorCode.NOT_FOUND, 404, `Job ${jobId} not found`)
        }
        if (job.status !== 'reported') {
          throw new AppError(ErrorCode.VALIDATION_ERROR, 400, `Job ${jobId} is not in reported state`)
        }
        job.status = 'rejected'
        return { id: jobId, status: 'rejected', reason }
      }),
    },
  }
})

const INSPECTOR_ID = 'inspector-test-user-001'
const ADMIN_ID = 'admin-user-001'
const OTHER_INSPECTOR_ID = 'inspector-other-002'

function buildApp(role: string = 'inspector', userId: string = INSPECTOR_ID) {
  const adapter = new StubSorobanAdapter({ rpcUrl: '', networkPassphrase: '' })
  const app = express()
  app.use(express.json())
  // Inject a fake authenticated user so we can test bond logic without Postgres auth
  app.use((req: any, _res, next) => {
    req.user = { id: userId, role }
    next()
  })
  app.use('/api/v1/inspector', createInspectorJobsRouter(adapter))
  app.use('/api/v1/admin/inspector', createAdminInspectorJobsRouter())
  app.use(errorHandler)
  return app
}

describe('Inspector Jobs API', () => {
  beforeEach(() => {
    StubSorobanAdapter._testOnlyReset()
    jobStateStore.clear()
  })

  describe('POST /api/v1/inspector/bond/stake', () => {
    it('stakes a bond for an authenticated inspector', async () => {
      const res = await request(buildApp())
        .post('/api/v1/inspector/bond/stake')
        .send({ amount: '500' })
        .expect(200)

      expect(res.body.success).toBe(true)
    })

    it('returns 400 when amount is missing', async () => {
      await request(buildApp())
        .post('/api/v1/inspector/bond/stake')
        .send({})
        .expect(400)
    })

    it('returns 403 when user is not an inspector', async () => {
      await request(buildApp('tenant'))
        .post('/api/v1/inspector/bond/stake')
        .send({ amount: '500' })
        .expect(403)
    })
  })

  describe('DELETE /api/v1/inspector/bond/unstake', () => {
    it('unstakes an existing bond', async () => {
      const app = buildApp()

      await request(app)
        .post('/api/v1/inspector/bond/stake')
        .send({ amount: '500' })
        .expect(200)

      const res = await request(app)
        .delete('/api/v1/inspector/bond/unstake')
        .expect(200)

      expect(res.body.success).toBe(true)
    })

    it('returns 400 when inspector has no active bond', async () => {
      await request(buildApp())
        .delete('/api/v1/inspector/bond/unstake')
        .expect(400)
    })
  })

  describe('GET /api/v1/inspector/bond/status', () => {
    it('returns not bonded when no stake exists', async () => {
      const res = await request(buildApp())
        .get('/api/v1/inspector/bond/status')
        .expect(200)

      expect(res.body.isBonded).toBe(false)
      expect(res.body.amount).toBe('0')
    })

    it('returns bonded status after staking', async () => {
      const app = buildApp()

      await request(app)
        .post('/api/v1/inspector/bond/stake')
        .send({ amount: '1000' })
        .expect(200)

      const res = await request(app)
        .get('/api/v1/inspector/bond/status')
        .expect(200)

      expect(res.body.isBonded).toBe(true)
      expect(res.body.amount).toBe('1000')
    })
  })

  describe('POST /api/v1/inspector/jobs/:id/claim', () => {
    it('allows a bonded inspector to claim a job', async () => {
      const app = buildApp()

      jobStateStore.set('job-abc-123', { status: 'open', claimedBy: null, report: null })

      await request(app)
        .post('/api/v1/inspector/bond/stake')
        .send({ amount: '100000000' })
        .expect(200)

      const res = await request(app)
        .post('/api/v1/inspector/jobs/job-abc-123/claim')
        .expect(200)

      expect(res.body.success).toBe(true)
      expect(res.body.data.status).toBe('claimed')
    })

    it('returns 403 when inspector has no bond', async () => {
      await request(buildApp())
        .post('/api/v1/inspector/jobs/job-xyz-456/claim')
        .expect(403)
    })

    it('stake → unstake → claim returns 403', async () => {
      const app = buildApp()

      await request(app)
        .post('/api/v1/inspector/bond/stake')
        .send({ amount: '500' })
        .expect(200)

      await request(app)
        .delete('/api/v1/inspector/bond/unstake')
        .expect(200)

      await request(app)
        .post('/api/v1/inspector/jobs/job-round-trip/claim')
        .expect(403)
    })

    it('returns 400 when job was already claimed by another inspector', async () => {
      const app1 = buildApp('inspector', INSPECTOR_ID)
      const app2 = buildApp('inspector', OTHER_INSPECTOR_ID)

      // Setup job
      jobStateStore.set('job-contested-1', { status: 'open', claimedBy: null, report: null })

      // Inspector 1 stakes and claims
      await request(app1)
        .post('/api/v1/inspector/bond/stake')
        .send({ amount: '100000000' })
        .expect(200)

      await request(app1)
        .post('/api/v1/inspector/jobs/job-contested-1/claim')
        .expect(200)

      // Inspector 2 stakes and tries to claim same job
      await request(app2)
        .post('/api/v1/inspector/bond/stake')
        .send({ amount: '100000000' })
        .expect(200)

      await request(app2)
        .post('/api/v1/inspector/jobs/job-contested-1/claim')
        .expect(409)
    })
  })

  describe('GET /api/v1/inspector/jobs', () => {
    it('returns empty list when no jobs available', async () => {
      const app = buildApp()

      await request(app)
        .post('/api/v1/inspector/bond/stake')
        .send({ amount: '500' })
        .expect(200)

      const res = await request(app)
        .get('/api/v1/inspector/jobs')
        .expect(200)

      expect(res.body.success).toBe(true)
      expect(Array.isArray(res.body.data)).toBe(true)
      expect(res.body.data.length).toBe(0)
    })

    it('returns available jobs in the pool', async () => {
      const app = buildApp()

      // Setup some open jobs
      jobStateStore.set('job-1', { status: 'open', claimedBy: null, report: null })
      jobStateStore.set('job-2', { status: 'open', claimedBy: null, report: null })
      jobStateStore.set('job-claimed', { status: 'claimed', claimedBy: 'other-inspector', report: null })

      await request(app)
        .post('/api/v1/inspector/bond/stake')
        .send({ amount: '500' })
        .expect(200)

      const res = await request(app)
        .get('/api/v1/inspector/jobs')
        .expect(200)

      expect(res.body.success).toBe(true)
      expect(res.body.data.length).toBe(2)
      expect(res.body.data.map((j: any) => j.id)).toEqual(expect.arrayContaining(['job-1', 'job-2']))
    })

    it('returns 403 when user is not an inspector', async () => {
      await request(buildApp('tenant'))
        .get('/api/v1/inspector/jobs')
        .expect(403)
    })
  })

  describe('POST /api/v1/inspector/jobs/:id/report', () => {
    it('allows inspector to submit report for a claimed job', async () => {
      const app = buildApp()

      // Setup job as claimed by this inspector
      jobStateStore.set('job-to-report', { status: 'claimed', claimedBy: INSPECTOR_ID, report: null })

      const res = await request(app)
        .post('/api/v1/inspector/jobs/job-to-report/report')
        .send({ findings: 'Property condition is excellent' })
        .expect(201)

      expect(res.body.success).toBe(true)
      expect(res.body.data.job.status).toBe('reported')
    })

    it('returns 403 when user is not an inspector', async () => {
      jobStateStore.set('job-to-report', { status: 'claimed', claimedBy: 'someone', report: null })

      await request(buildApp('tenant'))
        .post('/api/v1/inspector/jobs/job-to-report/report')
        .send({ findings: 'test' })
        .expect(403)
    })

    it('returns 400 when inspector did not claim the job', async () => {
      const app = buildApp()

      // Setup job claimed by different inspector
      jobStateStore.set('job-other-claim', { status: 'claimed', claimedBy: OTHER_INSPECTOR_ID, report: null })

      await request(app)
        .post('/api/v1/inspector/jobs/job-other-claim/report')
        .send({ findings: 'test' })
        .expect(400)
    })

    it('returns 400 when job is not in claimed state', async () => {
      const app = buildApp()

      jobStateStore.set('job-not-claimed', { status: 'open', claimedBy: null, report: null })

      await request(app)
        .post('/api/v1/inspector/jobs/job-not-claimed/report')
        .send({ findings: 'test' })
        .expect(400)
    })
  })

  describe('POST /api/v1/inspector/jobs/:id/approve (admin)', () => {
    it('allows admin to approve a reported job', async () => {
      const app = buildApp('admin', ADMIN_ID)

      jobStateStore.set('job-to-approve', { status: 'reported', claimedBy: INSPECTOR_ID, report: { findings: 'good' } })

      const res = await request(app)
        .post('/api/v1/admin/inspector/jobs/job-to-approve/approve')
        .expect(200)

      expect(res.body.success).toBe(true)
      expect(res.body.data.status).toBe('approved')
    })

    it('returns 403 when user is not an admin', async () => {
      jobStateStore.set('job-for-reject', { status: 'reported', claimedBy: INSPECTOR_ID, report: {} })

      await request(buildApp('inspector'))
        .post('/api/v1/admin/inspector/jobs/job-for-reject/approve')
        .expect(403)
    })

    it('returns 400 when job is not in reported state', async () => {
      const app = buildApp('admin', ADMIN_ID)

      jobStateStore.set('job-wrong-state', { status: 'open', claimedBy: null, report: null })

      await request(app)
        .post('/api/v1/admin/inspector/jobs/job-wrong-state/approve')
        .expect(400)
    })

    it('returns 400 when trying to approve the same job twice', async () => {
      const app = buildApp('admin', ADMIN_ID)

      jobStateStore.set('job-double-approve', { status: 'reported', claimedBy: INSPECTOR_ID, report: {} })

      await request(app)
        .post('/api/v1/admin/inspector/jobs/job-double-approve/approve')
        .expect(200)

      // Try to approve again — should fail
      await request(app)
        .post('/api/v1/admin/inspector/jobs/job-double-approve/approve')
        .expect(400)
    })
  })

  describe('POST /api/v1/inspector/jobs/:id/reject (admin)', () => {
    it('allows admin to reject a reported job', async () => {
      const app = buildApp('admin', ADMIN_ID)

      jobStateStore.set('job-to-reject', { status: 'reported', claimedBy: INSPECTOR_ID, report: { findings: 'bad' } })

      const res = await request(app)
        .post('/api/v1/admin/inspector/jobs/job-to-reject/reject')
        .send({ reason: 'Incomplete report' })
        .expect(200)

      expect(res.body.success).toBe(true)
      expect(res.body.data.status).toBe('rejected')
      expect(res.body.data.reason).toBe('Incomplete report')
    })

    it('returns 403 when user is not an admin', async () => {
      jobStateStore.set('job-for-reject', { status: 'reported', claimedBy: INSPECTOR_ID, report: {} })

      await request(buildApp('inspector'))
        .post('/api/v1/admin/inspector/jobs/job-for-reject/reject')
        .send({ reason: 'test' })
        .expect(403)
    })

    it('returns 400 when job is not in reported state', async () => {
      const app = buildApp('admin', ADMIN_ID)

      jobStateStore.set('job-not-reported', { status: 'claimed', claimedBy: INSPECTOR_ID, report: null })

      await request(app)
        .post('/api/v1/admin/inspector/jobs/job-not-reported/reject')
        .send({ reason: 'test' })
        .expect(400)
    })
  })

  describe('Job lifecycle state machine', () => {
    it('completes full lifecycle: open → claimed → reported → approved', async () => {
      const inspectorApp = buildApp('inspector', INSPECTOR_ID)
      const adminApp = buildApp('admin', ADMIN_ID)

      // Setup job
      jobStateStore.set('job-lifecycle', { status: 'open', claimedBy: null, report: null })

      // Inspector stakes and claims
      await request(inspectorApp)
        .post('/api/v1/inspector/bond/stake')
        .send({ amount: '100000000' })
        .expect(200)

      await request(inspectorApp)
        .post('/api/v1/inspector/jobs/job-lifecycle/claim')
        .expect(200)

      // Inspector submits report
      await request(inspectorApp)
        .post('/api/v1/inspector/jobs/job-lifecycle/report')
        .send({ findings: 'Property is in good condition' })
        .expect(201)

      // Admin approves
      const res = await request(adminApp)
        .post('/api/v1/admin/inspector/jobs/job-lifecycle/approve')
        .expect(200)

      expect(res.body.data.status).toBe('approved')
    })

    it('prevents reporting a job not claimed by the caller', async () => {
      const app1 = buildApp('inspector', INSPECTOR_ID)
      const app2 = buildApp('inspector', OTHER_INSPECTOR_ID)

      jobStateStore.set('job-wrong-claimer', { status: 'claimed', claimedBy: INSPECTOR_ID, report: null })

      // App2 (different inspector) tries to report
      await request(app2)
        .post('/api/v1/inspector/jobs/job-wrong-claimer/report')
        .send({ findings: 'test' })
        .expect(400)
    })

    it('prevents approving before report is submitted', async () => {
      const adminApp = buildApp('admin', ADMIN_ID)

      jobStateStore.set('job-early-approve', { status: 'claimed', claimedBy: INSPECTOR_ID, report: null })

      await request(adminApp)
        .post('/api/v1/admin/inspector/jobs/job-early-approve/approve')
        .expect(400)
    })
  })
})
