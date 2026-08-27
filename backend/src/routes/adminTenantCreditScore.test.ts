import { describe, it, expect, beforeEach, vi } from 'vitest'
import express from 'express'
import request from 'supertest'

vi.mock('../middleware/auth.js', () => ({
  authenticateToken: (_req: express.Request, _res: express.Response, next: express.NextFunction) => {
    next()
  },
}))

import { createAdminTenantCreditScoreRouter } from './adminTenantCreditScore.js'
import { tenantOnboardingDataStore } from '../models/tenantOnboardingDataStore.js'
import { tenantCreditScoreStore } from '../models/tenantCreditScoreStore.js'
import { tenantCreditScoringService } from '../services/tenantCreditScoringService.js'

const TENANT = 'admin-credit-tenant'

describe('GET /api/admin/tenants/:tenantId/credit-score', () => {
  beforeEach(() => {
    tenantOnboardingDataStore.clear()
    tenantCreditScoreStore.clear()
    tenantOnboardingDataStore.upsert(TENANT, {
      statedMonthlyIncome: 400_000,
      monthlyRent: 90_000,
      employmentStatus: 'employed',
      employerName: 'Acme',
      employmentProofText: 'Acme employment',
      bankStatementLines: [
        { date: '2026-01-01', description: 'Salary payroll', amount: 400_000 },
      ],
    })
    tenantCreditScoringService.computeCompositeScore(TENANT)
  })

  function buildApp(role: string) {
    const app = express()
    app.use(express.json())
    app.use((req, _res, next) => {
      ;(req as express.Request & { user?: { id: string; role: string } }).user = {
        id: 'admin-1',
        role,
      }
      next()
    })
    app.use('/api/admin', createAdminTenantCreditScoreRouter())
    return app
  }

  it('returns full score breakdown for admin', async () => {
    const res = await request(buildApp('admin')).get(`/api/admin/tenants/${TENANT}/credit-score`)
    expect(res.status).toBe(200)
    expect(res.body.tenantId).toBe(TENANT)
    expect(res.body.score).toBeGreaterThanOrEqual(0)
    expect(res.body.incomeScore).toBeDefined()
    expect(res.body.employmentScore).toBeDefined()
    expect(res.body.bankStatementScore).toBeDefined()
    expect(res.body.computedAt).toBeDefined()
  })

  it('rejects non-admin roles', async () => {
    const res = await request(buildApp('tenant')).get(`/api/admin/tenants/${TENANT}/credit-score`)
    expect(res.status).toBe(403)
  })
})
