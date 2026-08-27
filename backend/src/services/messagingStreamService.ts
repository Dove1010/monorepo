import { Response } from "express"
import { logger } from "../utils/logger.js"

const MAX_STREAMS_PER_USER = 5
const HEARTBEAT_INTERVAL_MS = 30_000

interface StreamClient {
  userId: string
  res: Response
  lastEventId: string | null
  heartbeatTimer: ReturnType<typeof setInterval>
  subscribedAt: number
}

const activeStreams = new Map<string, StreamClient[]>()

function getUserStreams(userId: string): StreamClient[] {
  return activeStreams.get(userId) || []
}

function addStream(client: StreamClient): boolean {
  const streams = getUserStreams(client.userId)
  if (streams.length >= MAX_STREAMS_PER_USER) {
    return false
  }
  streams.push(client)
  activeStreams.set(client.userId, streams)
  return true
}

function removeStream(client: StreamClient): void {
  const streams = getUserStreams(client.userId)
  const idx = streams.indexOf(client)
  if (idx !== -1) {
    streams.splice(idx, 1)
    if (streams.length === 0) {
      activeStreams.delete(client.userId)
    }
  }
}

function sendEvent(client: StreamClient, event: string, data: string, id?: string): void {
  try {
    if (id) {
      client.res.write(`id: ${id}\n`)
    }
    client.res.write(`event: ${event}\n`)
    client.res.write(`data: ${data}\n\n`)
  } catch {
    cleanupStream(client)
  }
}

function cleanupStream(client: StreamClient): void {
  clearInterval(client.heartbeatTimer)
  removeStream(client)
  try {
    client.res.end()
  } catch {
    void 0 // stream may already be closed
  }
}

export interface StreamEvent {
  type: "new_message" | "read_receipt"
  conversationId: string
  payload: Record<string, unknown>
}

export function broadcastToConversation(
  conversationId: string,
  participantIds: string[],
  event: StreamEvent,
): void {
  const eventId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const data = JSON.stringify(event)

  for (const userId of participantIds) {
    const streams = getUserStreams(userId)
    for (const client of streams) {
      sendEvent(client, event.type, data, eventId)
    }
  }
}

export function createStreamSession(userId: string, res: Response): { success: boolean; client: StreamClient | null } {
  const heartbeatTimer = setInterval(() => {
    const streams = getUserStreams(userId)
    const client = streams.find((s) => s.res === res)
    if (client) {
      try {
        client.res.write(": heartbeat\n\n")
      } catch {
        cleanupStream(client!)
      }
    }
  }, HEARTBEAT_INTERVAL_MS)

  const client: StreamClient = {
    userId,
    res,
    lastEventId: null,
    heartbeatTimer,
    subscribedAt: Date.now(),
  }

  const added = addStream(client)
  if (!added) {
    clearInterval(heartbeatTimer)
    return { success: false, client: null }
  }

  return { success: true, client }
}

export function cleanupUserStreams(userId: string): void {
  const streams = getUserStreams(userId)
  for (const client of [...streams]) {
    cleanupStream(client)
  }
}

export function cleanupDisconnectedStream(res: Response): void {
  for (const [, streams] of activeStreams) {
    const client = streams.find((s) => s.res === res)
    if (client) {
      cleanupStream(client)
      return
    }
  }
}

export function getActiveStreamCount(): number {
  let count = 0
  for (const streams of activeStreams.values()) {
    count += streams.length
  }
  return count
}
