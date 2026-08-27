import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
}))

vi.mock('../db.js', () => ({
  getPool: vi.fn().mockResolvedValue({
    query: mockQuery,
    connect: vi.fn(),
  }),
}))

vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}))

import { ErasureService } from './erasureService.js'

function makeErasureRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'req-1',
    user_id: 'user-1',
    status: 'pending',
    requested_at: '2026-01-01T00:00:00Z',
    confirm_by: '2026-02-01T00:00:00Z',
    confirmed_at: null,
    confirmed_by: null,
    ...overrides,
  }
}

describe('ErasureService', () => {
  let service: ErasureService

  beforeEach(() => {
    service = new ErasureService()
    mockQuery.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ---------------------------------------------------------------------------
  // requestErasure
  // ---------------------------------------------------------------------------
  describe('requestErasure', () => {
    it('creates a new erasure request when none exists', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [makeErasureRow()] })

      const result = await service.requestErasure('user-1')

      expect(result).toBeDefined()
      expect(result.userId).toBe('user-1')
      expect(result.status).toBe('pending')
    })

    it('throws when a pending request already exists', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'existing-req' }],
      })

      await expect(service.requestErasure('user-1')).rejects.toThrow(
        'ERASURE_ALREADY_PENDING',
      )
    })
  })

  // ---------------------------------------------------------------------------
  // confirmErasure — PII removal
  // ---------------------------------------------------------------------------
  describe('confirmErasure', () => {
    it('anonymises PII across all relevant tables', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [makeErasureRow()] }) // findById
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // UPDATE users
        .mockResolvedValueOnce({ rows: [] }) // UPDATE landlord_profiles
        .mockResolvedValueOnce({ rows: [] }) // UPDATE onboarding_drafts
        .mockResolvedValueOnce({ rows: [] }) // UPDATE kyc_documents
        .mockResolvedValueOnce({ rows: [] }) // UPDATE sessions
        .mockResolvedValueOnce({ rows: [] }) // UPDATE erasure_requests
        .mockResolvedValueOnce({ rows: [] }) // COMMIT

      await service.confirmErasure('req-1', 'admin-user-1')

      const calls = mockQuery.mock.calls.map((c: any[]) => c[0] as string)

      expect(calls.some(c => c.includes('UPDATE users SET'))).toBe(true)
      expect(calls.some(c => c.includes('UPDATE landlord_profiles SET'))).toBe(true)
      expect(calls.some(c => c.includes('UPDATE onboarding_drafts SET'))).toBe(true)
      expect(calls.some(c => c.includes('UPDATE kyc_documents SET'))).toBe(true)
      expect(calls.some(c => c.includes('UPDATE sessions SET'))).toBe(true)
      expect(calls.some(c => c.includes('UPDATE erasure_requests SET'))).toBe(true)
      expect(calls).toContain('BEGIN')
      expect(calls).toContain('COMMIT')
    })

    it('rolls back on failure and does not leave half-erased state', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [makeErasureRow()] })
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // UPDATE users
        .mockRejectedValueOnce(new Error('DB write failed'))
        .mockResolvedValueOnce({ rows: [] }) // ROLLBACK

      await expect(
        service.confirmErasure('req-1', 'admin-user-1'),
      ).rejects.toThrow('DB write failed')

      const calls = mockQuery.mock.calls.map((c: any[]) => c[0])
      expect(calls).toContain('ROLLBACK')
    })

    it('throws when erasure request is not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      await expect(service.confirmErasure('nonexistent', 'admin-1')).rejects.toThrow(
        'ERASURE_NOT_FOUND',
      )
    })

    it('throws when erasure request is not pending', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [makeErasureRow({ status: 'completed' })],
      })

      await expect(service.confirmErasure('req-1', 'admin-1')).rejects.toThrow(
        'ERASURE_NOT_PENDING',
      )
    })
  })

  // ---------------------------------------------------------------------------
  // Idempotency
  // ---------------------------------------------------------------------------
  describe('idempotency', () => {
    it('confirming an already-completed request throws safely', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [makeErasureRow({ status: 'completed' })],
      })

      await expect(service.confirmErasure('req-1', 'admin-1')).rejects.toThrow(
        'ERASURE_NOT_PENDING',
      )
    })

    it('requesting erasure twice for same user throws on second attempt', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'first-req' }],
      })

      await expect(service.requestErasure('user-1')).rejects.toThrow(
        'ERASURE_ALREADY_PENDING',
      )
    })
  })

  // ---------------------------------------------------------------------------
  // Legal hold exclusion
  // ---------------------------------------------------------------------------
  describe('legal hold exclusion', () => {
    it('anonymises rather than deletes — user row is updated, not removed', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [makeErasureRow()] }) // findById
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // UPDATE users
        .mockResolvedValueOnce({ rows: [] }) // UPDATE landlord_profiles
        .mockResolvedValueOnce({ rows: [] }) // UPDATE onboarding_drafts
        .mockResolvedValueOnce({ rows: [] }) // UPDATE kyc_documents
        .mockResolvedValueOnce({ rows: [] }) // UPDATE sessions
        .mockResolvedValueOnce({ rows: [] }) // UPDATE erasure_requests
        .mockResolvedValueOnce({ rows: [] }) // COMMIT

      await service.confirmErasure('req-1', 'admin-1')

      const userUpdate = mockQuery.mock.calls.find((c: any[]) =>
        (c[0] as string).includes('UPDATE users SET'),
      )
      expect(userUpdate).toBeDefined()
      expect(userUpdate![1]).toContain('user-1')
      const token = userUpdate![1].find((arg: any) => typeof arg === 'string' && arg.startsWith('[ERASED_'))
      expect(token).toBeDefined()
    })
  })

  // ---------------------------------------------------------------------------
  // expireOverdueRequests
  // ---------------------------------------------------------------------------
  describe('expireOverdueRequests', () => {
    it('returns the number of expired requests', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 3 })

      const count = await service.expireOverdueRequests(new Date('2026-03-01'))
      expect(count).toBe(3)
    })

    it('returns 0 when no requests are overdue', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0 })

      const count = await service.expireOverdueRequests()
      expect(count).toBe(0)
    })
  })

  // ---------------------------------------------------------------------------
  // findPendingByUserId
  // ---------------------------------------------------------------------------
  describe('findPendingByUserId', () => {
    it('returns the pending erasure request for a user', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeErasureRow()] })

      const result = await service.findPendingByUserId('user-1')
      expect(result).not.toBeNull()
      expect(result?.userId).toBe('user-1')
      expect(result?.status).toBe('pending')
    })

    it('returns null when no pending request exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await service.findPendingByUserId('user-no-req')
      expect(result).toBeNull()
    })
  })

  // ---------------------------------------------------------------------------
  // findById
  // ---------------------------------------------------------------------------
  describe('findById', () => {
    it('returns an erasure request by id', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [makeErasureRow({ id: 'req-42' })],
      })

      const result = await service.findById('req-42')
      expect(result).not.toBeNull()
      expect(result?.id).toBe('req-42')
    })

    it('returns null for unknown id', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await service.findById('unknown')
      expect(result).toBeNull()
    })
  })
})
