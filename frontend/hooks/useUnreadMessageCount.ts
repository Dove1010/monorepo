"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import useAuthStore from "@/store/useAuthStore";
import { fetchUnreadMessageCount } from "@/lib/api/messaging";

export function useUnreadMessageCount() {
  const { isAuthenticated, token } = useAuthStore();
  const [unreadCount, setUnreadCount] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const mountedRef = useRef(true);

  const fetchCount = useCallback(async () => {
    if (!isAuthenticated) {
      setUnreadCount(0);
      return;
    }
    try {
      const count = await fetchUnreadMessageCount();
      if (mountedRef.current) {
        setUnreadCount(count);
      }
    } catch {
    }
  }, [isAuthenticated]);

  useEffect(() => {
    mountedRef.current = true;

    const initialTimer = setTimeout(fetchCount, 0);

    const pollInterval = setInterval(fetchCount, 30000);
    pollTimerRef.current = pollInterval;

    if (token) {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      const url = `${baseUrl}/api/v1/messaging/stream?token=${token}`;
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.addEventListener("connected", () => {
        if (mountedRef.current) setIsConnected(true);
      });

      es.addEventListener("new_message", () => {
        if (mountedRef.current) {
          setUnreadCount(prev => prev + 1);
        }
      });

      es.addEventListener("read_receipt", () => {
        fetchCount();
      });

      es.addEventListener("error", () => {
        if (mountedRef.current) setIsConnected(false);
      });
    }

    return () => {
      mountedRef.current = false;
      clearTimeout(initialTimer);
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (eventSourceRef.current) eventSourceRef.current.close();
    };
  }, [fetchCount, token]);

  const refresh = useCallback(() => {
    fetchCount();
  }, [fetchCount]);

  return { unreadCount, isConnected, refresh };
}
