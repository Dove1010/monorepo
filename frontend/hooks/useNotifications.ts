"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { getToken } from "@/lib/auth"
import { fetchUnreadCount, type NotificationItem } from "@/lib/notificationsApi"

type IncomingNotification = {
  id: string
  title: string
  body: string
  notificationType: string
  createdAt: string
}

const MAX_RECONNECT_ATTEMPTS = 5
const BASE_DELAY = 1000

export function useNotifications() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isConnected, setIsConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectAttemptRef = useRef(0)
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null)
  const mountedRef = useRef(true)
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null)
  const connectRef = useRef<() => void>(() => {})

  const getWsUrl = useCallback(() => {
    const token = getToken()
    if (!token) return null
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
    const host = process.env.NEXT_PUBLIC_API_URL
      ? process.env.NEXT_PUBLIC_API_URL.replace(/^https?/, "ws").replace(/\/api$/, "")
      : `${protocol}//${window.location.host}`
    return `${host}/ws/notifications?token=${token}`
  }, [])

  const clearPollTimer = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }, [])

  const startPolling = useCallback(() => {
    const poll = async () => {
      try {
        const r = await fetchUnreadCount()
        if (mountedRef.current) {
          setUnreadCount(r.data.unread)
        }
      } catch {
        // ignore polling errors
      }
    }
    void poll()
    pollTimerRef.current = setInterval(poll, 30000)
  }, [])

  const connect = useCallback(() => {
    const url = getWsUrl()
    if (!url) return

    if (wsRef.current?.readyState === WebSocket.OPEN) return

    try {
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        if (!mountedRef.current) return
        setIsConnected(true)
        reconnectAttemptRef.current = 0
        clearPollTimer()
      }

      ws.onmessage = (event) => {
        if (!mountedRef.current) return
        try {
          const msg = JSON.parse(event.data)
          if (msg.type === "notification") {
            const payload = msg.payload as IncomingNotification
            const newItem: NotificationItem = {
              id: payload.id,
              category: payload.notificationType,
              title: payload.title,
              body: payload.body,
              data: null,
              read: false,
              createdAt: payload.createdAt,
            }
            setNotifications((prev) => [newItem, ...prev])
            setUnreadCount((prev) => prev + 1)
          }
        } catch {
          // ignore parse errors
        }
      }

      ws.onclose = () => {
        if (!mountedRef.current) return
        setIsConnected(false)
        wsRef.current = null

        if (reconnectAttemptRef.current < MAX_RECONNECT_ATTEMPTS) {
          const delay = BASE_DELAY * Math.pow(2, reconnectAttemptRef.current)
          reconnectAttemptRef.current++
          reconnectTimerRef.current = setTimeout(() => {
            connectRef.current()
          }, delay)
        } else {
          startPolling()
        }
      }

      ws.onerror = () => {
        ws?.close()
      }
    } catch {
      startPolling()
    }
  }, [getWsUrl, clearPollTimer, startPolling])

  useEffect(() => {
    connectRef.current = connect
  }, [connect])

  useEffect(() => {
    mountedRef.current = true
    connect()

    return () => {
      mountedRef.current = false
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      clearPollTimer()
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [connect, clearPollTimer])

  return {
    notifications,
    unreadCount,
    isConnected,
  }
}
