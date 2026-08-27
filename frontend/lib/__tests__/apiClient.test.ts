import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/retryLogic', () => ({
  retryWithBackoff: vi.fn().mockImplementation(async (fn: () => Promise<unknown>) => fn()),
}))

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {
    status: number
    code?: string
    constructor({ message, status, code }: { message: string; status: number; code?: string }) {
      super(message)
      this.status = status
      this.code = code
    }
  },
  isAccountFrozenError: vi.fn(),
  ACCOUNT_FROZEN_MESSAGE: 'Account frozen',
}))

import { apiGet, apiPost, apiPut, apiPatch, apiDelete, withQuery } from '@/lib/apiClient'
import { apiFetch } from '@/lib/api'
import { retryWithBackoff } from '@/lib/retryLogic'

const mockedApiFetch = vi.mocked(apiFetch)
const mockedRetry = vi.mocked(retryWithBackoff)

describe('apiClient helpers', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mockedRetry.mockImplementation(async (fn: () => Promise<unknown>) => fn())
  })

  describe('apiGet', () => {
    it('calls retryWithBackoff wrapping apiFetch with GET', async () => {
      mockedApiFetch.mockResolvedValue({ id: 1 })

      const result = await apiGet('/api/items/1')

      expect(mockedRetry).toHaveBeenCalled()
      expect(result).toEqual({ id: 1 })
    })
  })

  describe('apiPost', () => {
    it('wraps apiFetch with POST and body in retryWithBackoff', async () => {
      mockedApiFetch.mockResolvedValue({ created: true })

      await apiPost('/api/items', { name: 'test' })

      expect(mockedRetry).toHaveBeenCalled()
      expect(mockedApiFetch).toHaveBeenCalledWith('/api/items', {
        method: 'POST',
        body: JSON.stringify({ name: 'test' }),
      })
    })
  })

  describe('apiPut', () => {
    it('wraps apiFetch with PUT and body', async () => {
      mockedApiFetch.mockResolvedValue({ updated: true })

      await apiPut('/api/items/1', { name: 'updated' })

      expect(mockedApiFetch).toHaveBeenCalledWith('/api/items/1', {
        method: 'PUT',
        body: JSON.stringify({ name: 'updated' }),
      })
    })
  })

  describe('apiPatch', () => {
    it('wraps apiFetch with PATCH and body', async () => {
      mockedApiFetch.mockResolvedValue({ patched: true })

      await apiPatch('/api/items/1', { name: 'patched' })

      expect(mockedApiFetch).toHaveBeenCalledWith('/api/items/1', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'patched' }),
      })
    })
  })

  describe('apiDelete', () => {
    it('wraps apiFetch with DELETE', async () => {
      mockedApiFetch.mockResolvedValue({ deleted: true })

      await apiDelete('/api/items/1')

      expect(mockedApiFetch).toHaveBeenCalledWith('/api/items/1', { method: 'DELETE' })
    })
  })

  describe('withQuery', () => {
    it('appends query parameters', () => {
      const result = withQuery('/api/items', { status: 'active', limit: 10 })
      expect(result).toBe('/api/items?status=active&limit=10')
    })

    it('omits null and undefined values', () => {
      const result = withQuery('/api/items', { status: 'active', page: undefined, limit: null })
      expect(result).toBe('/api/items?status=active')
    })

    it('returns path without query string when no params', () => {
      const result = withQuery('/api/items', {})
      expect(result).toBe('/api/items')
    })

    it('handles boolean values', () => {
      const result = withQuery('/api/items', { active: true })
      expect(result).toBe('/api/items?active=true')
    })
  })
})
