"use client";

import { useEffect } from "react";

/**
 * Registers the service worker that keeps the app usable offline.
 *
 * Production only: in development Next serves a fresh bundle per request, and
 * a cache-first worker would hand back stale chunks and confuse Fast Refresh.
 */
export function PwaBridge() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // Offline support is optional; the app works without it.
      });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });

    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
