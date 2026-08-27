import { describe, it, expect, beforeEach, vi } from 'vitest'
import express from 'express'
import request from 'supertest'

vi.mock('../middleware/auth.js', () => ({
  authenticateToken: (_req: express.Request, _res: express.Response, next: express.NextFunction) => {
    next()
  },
}))

import { createAdminCreditScoreRouter } from './creditScore.js'
import { bandFromScore, creditScoreSnapshotStore } from '../models/creditScoreSnapshot.js'
import { errorHandler } from '../middleware/errorHandler.js'
import { requestIdMiddleware } from '../middleware/requestId.js'
import { ErrorCode } from '../errors/errorCodes.js'

const TENANT = 'admin-credit-score-tenant'

describe('GET /api/v1/admin/credit-score/:tenantId', () => {
  beforeEach(async () => {
    await creditScoreSnapshotStore.clear()
    await creditScoreSnapshotStore.create({
      userId: TENANT,
      score: 72,
      band: bandFromScore(72),
      factors: [
        {
          name: 'income_ratio',
          status: 'pass',
          weight: 30,
          detail: 'Healthy rent-to-income ratio',
        },
      ],
    })
  })

  function buildApp(role: string) {
    const app = express()
    app.use(requestIdMiddleware)
    app.use(express.json())
    app.use((req, _res, next) => {
      ;(req as express.Request & { user?: { id: string; role: string } }).user = {
        id: 'admin-1',
        role,
      }
      next()
    })
    app.use('/api/v1/admin/credit-score', createAdminCreditScoreRouter())
    app.use(errorHandler)
    return app
  }

  it('returns the tenant latest score snapshot for admin', async () => {
    const res = await request(buildApp('admin')).get(`/api/v1/admin/credit-score/${TENANT}`)

    expect(res.status).toBe(200)
    expect(res.body.tenantId).toBe(TENANT)
    expect(res.body.score).toBe(72)
    expect(res.body.band).toBe('good')
    expect(res.body.factors).toHaveLength(1)
    expect(res.body.computedAt).toBeDefined()
    expect(res.body.tips).toBeDefined()
  })

  it('rejects non-admin callers', async () => {
    const res = await request(buildApp('tenant')).get(`/api/v1/admin/credit-score/${TENANT}`)

    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe(ErrorCode.FORBIDDEN)
  })

  it('returns 404 NO_SCORE_YET when no snapshot exists', async () => {
    const res = await request(buildApp('admin')).get('/api/v1/admin/credit-score/missing-tenant')

    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe(ErrorCode.NO_SCORE_YET)
  })
})
