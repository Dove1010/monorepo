import { describe, expect, it, vi } from 'vitest'
import {
  clearOfflineQueue,
  clearOfflineQueueFailures,
  enqueueOfflineRequest,
  flushOfflineQueue,
  getOfflineQueueCount,
  getOfflineQueueFailures,
} from '@/lib/offline-queue'

describe('offline queue', () => {
  it('survives a reload because entries are persisted in localStorage', async () => {
    enqueueOfflineRequest({
      path: '/api/items',
      method: 'POST',
      body: '{"value":1}',
      headers: { 'Content-Type': 'application/json' },
    })

    expect(getOfflineQueueCount()).toBe(1)

    vi.resetModules()
    const reloadedModule = await import('@/lib/offline-queue')
    expect(reloadedModule.getOfflineQueueCount()).toBe(1)

    reloadedModule.clearOfflineQueue()
  })

  it('stores offline mutations locally', () => {
    enqueueOfflineRequest({
      path: '/api/items',
      method: 'POST',
      body: '{"value":1}',
      headers: { 'Content-Type': 'application/json' },
    })

    expect(getOfflineQueueCount()).toBe(1)
  })

  it('flushes successful requests and clears the queue', async () => {
    enqueueOfflineRequest({
      path: '/api/items',
      method: 'POST',
      body: '{"value":1}',
      headers: { 'Content-Type': 'application/json' },
    })
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )

    const flushed = await flushOfflineQueue('https://api.example.com')

    expect(flushed).toBe(1)
    expect(getOfflineQueueCount()).toBe(0)
    clearOfflineQueue()
  })

  it('replays a queued request with the same idempotency key', async () => {
    enqueueOfflineRequest({
      path: '/api/items',
      method: 'POST',
      body: '{"value":1}',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'payment-intent-123',
      },
    })

    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )

    await flushOfflineQueue('https://api.example.com')

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.example.com/api/items',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Idempotency-Key': 'payment-intent-123',
        }),
      }),
    )
    clearOfflineQueue()
  })

  it('moves invalidated actions into the surfaced failure list', async () => {
    enqueueOfflineRequest({
      path: '/api/items',
      method: 'POST',
      body: '{"value":1}',
      headers: { 'Content-Type': 'application/json' },
    })

    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: false }), { status: 410 }),
    )

    await flushOfflineQueue('https://api.example.com')

    expect(getOfflineQueueCount()).toBe(0)
    expect(getOfflineQueueFailures()).toHaveLength(1)

    clearOfflineQueue()
    clearOfflineQueueFailures()
  })
})
