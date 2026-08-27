import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ApiError, isAccountFrozenError, apiFetch, apiPost } from '@/lib/api'

vi.mock('@/lib/offline-queue', () => ({
  enqueueOfflineRequest: vi.fn(),
}))

vi.mock('@/lib/csrf-protection', () => ({
  csrfProtection: {
    getCurrentToken: vi.fn().mockReturnValue('csrf-token'),
    initialize: vi.fn().mockReturnValue('csrf-token'),
  },
}))

describe('ApiError', () => {
  it('is an instance of Error', () => {
    const err = new ApiError({ message: 'test', status: 400 })
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(ApiError)
  })

  it('has status and code properties', () => {
    const err = new ApiError({ message: 'forbidden', status: 403, code: 'FORBIDDEN' })
    expect(err.status).toBe(403)
    expect(err.code).toBe('FORBIDDEN')
    expect(err.name).toBe('ApiError')
  })

  it('stores details', () => {
    const details = { field: 'email' }
    const err = new ApiError({ message: 'validation', status: 422, details })
    expect(err.details).toEqual(details)
  })
})

describe('isAccountFrozenError', () => {
  it('returns true for ACCOUNT_FROZEN ApiError', () => {
    const err = new ApiError({ message: 'frozen', status: 403, code: 'ACCOUNT_FROZEN' })
    expect(isAccountFrozenError(err)).toBe(true)
  })

  it('returns false for other ApiErrors', () => {
    const err = new ApiError({ message: 'other', status: 500 })
    expect(isAccountFrozenError(err)).toBe(false)
  })

  it('returns false for non-ApiError values', () => {
    expect(isAccountFrozenError(new Error('test'))).toBe(false)
    expect(isAccountFrozenError(null)).toBe(false)
    expect(isAccountFrozenError(undefined)).toBe(false)
  })
})

describe('apiFetch', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, writable: true })
  })

  it('makes a successful request and returns JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const result = await apiFetch<{ ok: boolean }>('/api/test')
    expect(result).toEqual({ ok: true })
  })

  it('attaches Authorization header when token exists', async () => {
    localStorage.setItem('shelterflex_token', 'auth-token')
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 })
    )

    await apiFetch('/api/test')

    const headers = fetchSpy.mock.calls[0][1]?.headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer auth-token')
  })

  it('does not attach Authorization header when no token', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 })
    )

    await apiFetch('/api/test')

    const headers = fetchSpy.mock.calls[0][1]?.headers as Headers
    expect(headers.get('Authorization')).toBeNull()
  })

  it('throws ApiError for non-ok responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Not found' } }), {
        status: 404,
      })
    )

    await expect(apiFetch('/api/missing')).rejects.toThrow()
  })

  it('throws connection error for network failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(apiFetch('/api/test')).rejects.toThrow('Cannot connect to backend')
  })
})

describe('apiPost', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('sends a POST request with JSON body', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ created: true }), { status: 200 })
    )

    const result = await apiPost('/api/create', { name: 'test' })

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/create'),
      expect.objectContaining({ method: 'POST' })
    )
    expect(result).toEqual({ created: true })
  })
})
