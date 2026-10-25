"use client";

import { useEffect } from "react";

/**
 * Registers the service worker that keeps the app usable offline.
 *
 * Production only: in development Next serves a fresh bundle per request, and
 * a cache-first worker would hand back stale chunks and confuse Fast Refresh.
 *
 * Deploys replace the worker because public/sw.js changes its cache VERSION.
 * The new worker calls skipWaiting(), so it activates while this page is open;
 * `controllerchange` then reloads the tab once, which is what gets the new
 * HTML and chunk hashes instead of leaving the old bundle on screen.
 */
export function PwaBridge() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    // Only reload for a *replacement* worker. A first install also fires
    // controllerchange, and reloading there would double every first visit.
    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloading = false;
    const onControllerChange = () => {
      if (!hadController || reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .then((registration) => {
          // Check for a new worker on every load instead of waiting for the
          // browser's own (up to 24h) schedule.
          registration.update().catch(() => {});
        })
        .catch(() => {
          // Offline support is optional; the app works without it.
        });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });

    return () => {
      window.removeEventListener("load", register);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  return null;
}
