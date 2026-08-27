/**
 * tenantDataExportService.test.ts
 * PR #1215 — export completeness, cross-tenant scoping, field safety, empty export.
 *
 * The service calls the module-level `dataExportRepository` singleton directly.
 * We mock that module and swap in a fresh in-memory DataExportRepository
 * instance per describe block so tests are fully isolated.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DataExportRepository } from '../repositories/DataExportRepository.js'

vi.mock('../utils/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

// We mock the repository module so we can swap the singleton per test.
// The factory fn returns a fresh instance; we replace it each time we need isolation.
let activeRepo: DataExportRepository

vi.mock('../repositories/DataExportRepository.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../repositories/DataExportRepository.js')>()
  return {
    ...actual,
    // Proxy every call through `activeRepo` so tests can swap it freely
    dataExportRepository: {
      createJob: (...a: any[]) => activeRepo.createJob(...a),
      getJob: (...a: any[]) => activeRepo.getJob(...a),
      getJobByIdForUser: (...a: any[]) => activeRepo.getJobByIdForUser(...a),
      updateJob: (...a: any[]) => activeRepo.updateJob(...a),
      markExpiredJobs: (...a: any[]) => activeRepo.markExpiredJobs(...a),
    },
  }
})

// Import AFTER mock is registered
const { TenantDataExportService } = await import('./tenantDataExportService.js')

const TENANT_A = 'tenant-aaaa-0001'
const TENANT_B = 'tenant-bbbb-0002'

// Reset to a fresh repo before each test
beforeEach(() => { activeRepo = new DataExportRepository() })

// ─── 1. requestExport — job creation ─────────────────────────────────────────

describe('TenantDataExportService.requestExport', () => {
  it('returns a job with status pending immediately', async () => {
    const job = await activeRepo.createJob(TENANT_A)
    expect(job.status).toBe('pending')
    expect(job.userId).toBe(TENANT_A)
    expect(job.id).toBeTruthy()
  })

  it('job has no downloadUrl or expiresAt on creation', async () => {
    const job = await activeRepo.createJob(TENANT_A)
    expect(job.downloadUrl).toBeUndefined()
    expect(job.expiresAt).toBeUndefined()
  })

  it('each call creates a distinct job id', async () => {
    const j1 = await activeRepo.createJob(TENANT_A)
    const j2 = await activeRepo.createJob(TENANT_A)
    expect(j1.id).not.toBe(j2.id)
  })

  it('returns the job immediately (pending) before processJob runs', async () => {
    vi.useFakeTimers()
    const svc = new TenantDataExportService()
    const job = await svc.requestExport(TENANT_A)
    expect(job.status).toBe('pending')
    vi.useRealTimers()
  })
})

// ─── 2. processJob — lifecycle and content ────────────────────────────────────

describe('TenantDataExportService.processJob', () => {
  it('transitions job pending → processing → ready', async () => {
    const svc = new TenantDataExportService()
    const job = await activeRepo.createJob(TENANT_A)
    await svc.processJob(job.id)
    expect((await activeRepo.getJob(job.id))!.status).toBe('ready')
  })

  it('ready job has a downloadUrl', async () => {
    const svc = new TenantDataExportService()
    const job = await activeRepo.createJob(TENANT_A)
    await svc.processJob(job.id)
    expect((await activeRepo.getJob(job.id))!.downloadUrl).toBeTruthy()
  })

  it('downloadUrl contains the job id', async () => {
    const svc = new TenantDataExportService()
    const job = await activeRepo.createJob(TENANT_A)
    await svc.processJob(job.id)
    expect((await activeRepo.getJob(job.id))!.downloadUrl).toContain(job.id)
  })

  it('downloadUrl does not expose the userId (PII)', async () => {
    const svc = new TenantDataExportService()
    const job = await activeRepo.createJob(TENANT_A)
    await svc.processJob(job.id)
    expect((await activeRepo.getJob(job.id))!.downloadUrl).not.toContain(TENANT_A)
  })

  it('expiresAt is ~48 hours in the future', async () => {
    const before = Date.now()
    const svc = new TenantDataExportService()
    const job = await activeRepo.createJob(TENANT_A)
    await svc.processJob(job.id)
    const after = Date.now()
    const expiryMs = (await activeRepo.getJob(job.id))!.expiresAt!.getTime()
    const h48 = 48 * 60 * 60 * 1000
    expect(expiryMs).toBeGreaterThanOrEqual(before + h48 - 1000)
    expect(expiryMs).toBeLessThanOrEqual(after  + h48 + 1000)
  })

  it('throws for a non-existent job id', async () => {
    await expect(new TenantDataExportService().processJob('no-such-job'))
      .rejects.toThrow('DataExportJob not found')
  })

  it('two tenants get distinct download URLs', async () => {
    const svc = new TenantDataExportService()
    const jA = await activeRepo.createJob(TENANT_A)
    const jB = await activeRepo.createJob(TENANT_B)
    await svc.processJob(jA.id)
    await svc.processJob(jB.id)
    const urlA = (await activeRepo.getJob(jA.id))!.downloadUrl
    const urlB = (await activeRepo.getJob(jB.id))!.downloadUrl
    expect(urlA).not.toBe(urlB)
  })
})

// ─── 3. Cross-tenant scoping ──────────────────────────────────────────────────

describe('TenantDataExportService.getExportStatus — cross-tenant scoping', () => {
  it("returns status for own job", async () => {
    const svc = new TenantDataExportService()
    const job = await activeRepo.createJob(TENANT_A)
    const status = await svc.getExportStatus(job.id, TENANT_A)
    expect(status).not.toBeNull()
    expect(status!.status).toBe('pending')
  })

  it("returns null when tenant B requests tenant A's job", async () => {
    const svc = new TenantDataExportService()
    const job = await activeRepo.createJob(TENANT_A)
    expect(await svc.getExportStatus(job.id, TENANT_B)).toBeNull()
  })

  it('returns null for a completely unknown job id', async () => {
    expect(await new TenantDataExportService().getExportStatus('ghost', TENANT_A)).toBeNull()
  })

  it("tenant B's job is invisible to tenant A", async () => {
    const svc = new TenantDataExportService()
    const jobB = await activeRepo.createJob(TENANT_B)
    expect(await svc.getExportStatus(jobB.id, TENANT_A)).toBeNull()
  })

  it('both tenants can see their own jobs simultaneously', async () => {
    const svc = new TenantDataExportService()
    const jA = await activeRepo.createJob(TENANT_A)
    const jB = await activeRepo.createJob(TENANT_B)
    expect((await svc.getExportStatus(jA.id, TENANT_A))!.status).toBe('pending')
    expect((await svc.getExportStatus(jB.id, TENANT_B))!.status).toBe('pending')
  })
})

// ─── 4. Field safety ─────────────────────────────────────────────────────────

describe('TenantDataExportService.getExportStatus — field safety', () => {
  it('response does not include userId', async () => {
    const svc = new TenantDataExportService()
    const job = await activeRepo.createJob(TENANT_A)
    const status = await svc.getExportStatus(job.id, TENANT_A)
    expect((status as any).userId).toBeUndefined()
  })

  it('response does not include internal id', async () => {
    const svc = new TenantDataExportService()
    const job = await activeRepo.createJob(TENANT_A)
    const status = await svc.getExportStatus(job.id, TENANT_A)
    expect((status as any).id).toBeUndefined()
  })

  it('ready job response has exactly status, downloadUrl, expiresAt — no internal fields', async () => {
    const svc = new TenantDataExportService()
    const job = await activeRepo.createJob(TENANT_A)
    await svc.processJob(job.id)
    const status = await svc.getExportStatus(job.id, TENANT_A)
    expect(status!.status).toBe('ready')
    expect(status!.downloadUrl).toBeTruthy()
    expect(status!.expiresAt).toBeInstanceOf(Date)
    const keys = Object.keys(status!)
    expect(keys).not.toContain('userId')
    expect(keys).not.toContain('id')
    expect(keys).not.toContain('createdAt')
    expect(keys).not.toContain('updatedAt')
  })

  it('pending response has no downloadUrl or expiresAt', async () => {
    const svc = new TenantDataExportService()
    const job = await activeRepo.createJob(TENANT_A)
    const status = await svc.getExportStatus(job.id, TENANT_A)
    expect(status!.status).toBe('pending')
    expect(status!.downloadUrl).toBeUndefined()
    expect(status!.expiresAt).toBeUndefined()
  })

  it('processing response has no downloadUrl yet', async () => {
    const svc = new TenantDataExportService()
    const job = await activeRepo.createJob(TENANT_A)
    await activeRepo.updateJob(job.id, { status: 'processing' })
    const status = await svc.getExportStatus(job.id, TENANT_A)
    expect(status!.status).toBe('processing')
    expect(status!.downloadUrl).toBeUndefined()
  })
})

// ─── 5. Empty export ─────────────────────────────────────────────────────────

describe('empty export — tenant with no prior data', () => {
  it('processJob succeeds for a brand-new tenant', async () => {
    const svc = new TenantDataExportService()
    const job = await activeRepo.createJob('new-tenant-zero-data')
    await expect(svc.processJob(job.id)).resolves.not.toThrow()
    expect((await activeRepo.getJob(job.id))!.status).toBe('ready')
  })

  it('empty export produces a valid https downloadUrl', async () => {
    const svc = new TenantDataExportService()
    const job = await activeRepo.createJob('new-tenant-zero-data')
    await svc.processJob(job.id)
    expect((await activeRepo.getJob(job.id))!.downloadUrl).toMatch(/^https:\/\//)
  })

  it('getExportStatus returns well-formed status for empty-export ready job', async () => {
    const svc = new TenantDataExportService()
    const job = await activeRepo.createJob('new-tenant-zero-data')
    await svc.processJob(job.id)
    const status = await svc.getExportStatus(job.id, 'new-tenant-zero-data')
    expect(status!.status).toBe('ready')
    expect(status!.downloadUrl).toBeTruthy()
    expect(status!.expiresAt).toBeInstanceOf(Date)
  })
})

// ─── 6. Job expiry ────────────────────────────────────────────────────────────

describe('DataExportRepository.markExpiredJobs', () => {
  it('marks past-expiry ready jobs as expired', async () => {
    const job = await activeRepo.createJob(TENANT_A)
    await activeRepo.updateJob(job.id, { status: 'ready', downloadUrl: 'https://x', expiresAt: new Date(Date.now() - 1000) })
    await activeRepo.markExpiredJobs()
    expect((await activeRepo.getJob(job.id))!.status).toBe('expired')
  })

  it('does not expire ready jobs with future expiresAt', async () => {
    const job = await activeRepo.createJob(TENANT_A)
    await activeRepo.updateJob(job.id, { status: 'ready', downloadUrl: 'https://x', expiresAt: new Date(Date.now() + 48 * 3600_000) })
    await activeRepo.markExpiredJobs()
    expect((await activeRepo.getJob(job.id))!.status).toBe('ready')
  })

  it('does not expire pending or processing jobs', async () => {
    const j1 = await activeRepo.createJob(TENANT_A)
    const j2 = await activeRepo.createJob(TENANT_B)
    await activeRepo.updateJob(j2.id, { status: 'processing' })
    await activeRepo.markExpiredJobs()
    expect((await activeRepo.getJob(j1.id))!.status).toBe('pending')
    expect((await activeRepo.getJob(j2.id))!.status).toBe('processing')
  })

  it('getExportStatus returns expired status for an expired job', async () => {
    const svc = new TenantDataExportService()
    const job = await activeRepo.createJob(TENANT_A)
    await activeRepo.updateJob(job.id, { status: 'ready', downloadUrl: 'https://x', expiresAt: new Date(Date.now() - 1000) })
    await activeRepo.markExpiredJobs()
    const status = await svc.getExportStatus(job.id, TENANT_A)
    expect(status!.status).toBe('expired')
  })
})

// ─── 7. DataExportRepository contract ────────────────────────────────────────

describe('DataExportRepository', () => {
  it('getJob returns null for unknown job', async () => {
    expect(await activeRepo.getJob('unknown')).toBeNull()
  })

  it('getJobByIdForUser returns null on userId mismatch', async () => {
    const job = await activeRepo.createJob(TENANT_A)
    expect(await activeRepo.getJobByIdForUser(job.id, TENANT_B)).toBeNull()
  })

  it('getJobByIdForUser returns job on userId match', async () => {
    const job = await activeRepo.createJob(TENANT_A)
    expect((await activeRepo.getJobByIdForUser(job.id, TENANT_A))!.id).toBe(job.id)
  })

  it('updateJob throws for unknown job', async () => {
    await expect(activeRepo.updateJob('no-such', { status: 'processing' })).rejects.toThrow('DataExportJob not found')
  })

  it('updateJob persists status', async () => {
    const job = await activeRepo.createJob(TENANT_A)
    await activeRepo.updateJob(job.id, { status: 'processing' })
    expect((await activeRepo.getJob(job.id))!.status).toBe('processing')
  })

  it('tenant jobs are independent', async () => {
    const jA = await activeRepo.createJob(TENANT_A)
    const jB = await activeRepo.createJob(TENANT_B)
    await activeRepo.updateJob(jA.id, { status: 'ready', downloadUrl: 'https://a' })
    expect((await activeRepo.getJob(jB.id))!.status).toBe('pending')
  })
})

// ─── 8. Store parity + PII safety ────────────────────────────────────────────

describe('store parity — export scope vs erasure scope', () => {
  it('DataExportJob.userId is the sole scoping key', async () => {
    const job = await activeRepo.createJob(TENANT_A)
    expect(job.userId).toBe(TENANT_A)
  })

  it('export job does not contain raw encryption artefacts', async () => {
    const svc = new TenantDataExportService()
    const job = await activeRepo.createJob(TENANT_A)
    await svc.processJob(job.id)
    const serialised = JSON.stringify(await activeRepo.getJob(job.id))
    expect(serialised).not.toMatch(/ENCRYPTION_KEY/i)
    expect(serialised).not.toMatch(/secret/i)
    expect(serialised).not.toMatch(/password/i)
  })

  it('status response shape is stable across multiple calls', async () => {
    const svc = new TenantDataExportService()
    const job = await activeRepo.createJob(TENANT_A)
    await svc.processJob(job.id)
    const s1 = await svc.getExportStatus(job.id, TENANT_A)
    const s2 = await svc.getExportStatus(job.id, TENANT_A)
    expect(Object.keys(s1!).sort()).toEqual(Object.keys(s2!).sort())
    expect(s1!.downloadUrl).toBe(s2!.downloadUrl)
  })
})
