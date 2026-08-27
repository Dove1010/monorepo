"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchUnreadCount } from "@/lib/notificationsApi";

const POLL_MS = 8000;

export function useNotificationUnread() {
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await fetchUnreadCount();
      setUnread(r.data.unread);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    const t0 = setTimeout(() => void refresh(), 0);
    const t = setInterval(() => void refresh(), POLL_MS);
    return () => {
      clearTimeout(t0);
      clearInterval(t);
    };
  }, [refresh]);

  return { unread, error, refresh };
}
