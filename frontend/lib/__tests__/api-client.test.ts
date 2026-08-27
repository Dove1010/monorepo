import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ApiClient } from '@/lib/api-client'

vi.mock('@/lib/wallet-auth', () => ({
  walletAuthManager: {
    getAuthToken: vi.fn(),
  },
}))

import { walletAuthManager } from '@/lib/wallet-auth'

const mockedGetAuthToken = vi.mocked(walletAuthManager.getAuthToken)

describe('ApiClient', () => {
  let client: ApiClient

  beforeEach(() => {
    vi.restoreAllMocks()
    mockedGetAuthToken.mockReturnValue(null)
    client = new ApiClient('https://api.test.com')
  })

  describe('get', () => {
    it('makes a GET request to the correct URL', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ data: 'ok' }), { status: 200 })
      )

      const result = await client.get('/api/test')

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.test.com/api/test',
        expect.objectContaining({ method: 'GET' })
      )
      expect(result).toEqual({ data: 'ok' })
    })

    it('attaches Authorization header when token exists', async () => {
      mockedGetAuthToken.mockReturnValue('my-token')
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 })
      )

      await client.get('/api/test')

      const headers = fetchSpy.mock.calls[0][1]?.headers as Record<string, string>
      expect(headers['Authorization']).toBe('Bearer my-token')
    })

    it('throws on non-ok response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('Not Found', { status: 404, statusText: 'Not Found' })
      )

      await expect(client.get('/api/missing')).rejects.toThrow('API Error: Not Found')
    })
  })

  describe('post', () => {
    it('makes a POST request with JSON body', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ created: true }), { status: 200 })
      )

      const result = await client.post('/api/create', { name: 'test' })

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.test.com/api/create',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'test' }),
        })
      )
      expect(result).toEqual({ created: true })
    })

    it('sends POST without body when data is undefined', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 })
      )

      await client.post('/api/action')

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.test.com/api/action',
        expect.objectContaining({ body: undefined })
      )
    })

    it('throws on server error', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('Server Error', { status: 500, statusText: 'Internal Server Error' })
      )

      await expect(client.post('/api/fail')).rejects.toThrow('API Error: Internal Server Error')
    })
  })

  describe('constructor', () => {
    it('uses the provided base URL', async () => {
      const customClient = new ApiClient('https://custom.api.com')
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({}), { status: 200 })
      )

      await customClient.get('/test')

      expect(fetchSpy.mock.calls[0][0]).toBe('https://custom.api.com/test')
    })
  })
})
