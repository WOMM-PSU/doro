"use client";

import { useEffect, useRef } from "react";
import { useDemo } from "@/components/providers";
import { sendLocalPush } from "@/lib/push-client";
import { inQuietHours } from "@/lib/time";

/**
 * Watches new notifications for the active persona and forwards them to the
 * browser's push subscription when the tab is in the background. In-app
 * notifications remain authoritative and always available.
 */
export function PushBridge() {
  const { state, user } = useDemo();
  const seen = useRef<{ userId: string; ids: Set<string> } | null>(null);

  useEffect(() => {
    const mine = state.notifications.filter((item) => item.userId === user.id);
    if (!seen.current || seen.current.userId !== user.id) {
      seen.current = { userId: user.id, ids: new Set(mine.map((item) => item.id)) };
      return;
    }

    const fresh = mine.filter((item) => !seen.current!.ids.has(item.id));
    for (const item of fresh) seen.current.ids.add(item.id);
    if (fresh.length === 0) return;
    if (document.visibilityState === "visible") return;

    const { startHour, endHour } = user.preferences.quietHours;
    if (inQuietHours(new Date().getHours(), startHour, endHour)) return;

    for (const item of fresh.slice(-3)) {
      if (item.kind === "MATCH" && !user.preferences.notifyMatches) continue;
      void sendLocalPush({
        title: item.title,
        body: item.body,
        url: item.taskId ? `/activity` : "/notifications",
        tag: item.id,
      });
    }
  }, [state.notifications, user.id, user.preferences]);

  return null;
}
