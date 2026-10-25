/**
 * Storage repository boundary.
 *
 * `LocalRepository` keeps the demo in localStorage. `SupabaseRepository`
 * mirrors the same state document through /api/sync when the server has
 * Supabase configured, and falls back without breaking the app. UI code never
 * touches fetch or localStorage directly.
 */

import type { DemoState } from "@/types";
import { saveState } from "@/lib/persistence";

export type SyncStatus = "local" | "connecting" | "synced" | "offline";

export interface SyncInfo {
  status: SyncStatus;
  detail: string;
  lastSyncedAt?: string;
}

export interface StateRepository {
  readonly kind: "local" | "supabase";
  save(state: DemoState): boolean;
  push(state: DemoState): void;
  /** `null` means cloud sync is not configured on this server. */
  pull(): Promise<{ state: DemoState | null } | null>;
  /**
   * Watches for remote changes. Called with `null` when the cloud workspace is
   * reachable but empty, so the caller can seed it.
   */
  subscribe(onRemote: (state: DemoState | null) => void): () => void;
  getSyncInfo(): SyncInfo;
  onSyncInfo(listener: (info: SyncInfo) => void): () => void;
}

export class LocalRepository implements StateRepository {
  readonly kind = "local" as const;
  private info: SyncInfo = {
    status: "local",
    detail: "Saved in this browser. Add Supabase keys to sync across devices.",
  };

  save(state: DemoState): boolean {
    return saveState(state);
  }

  push(): void {
    // Nothing to do: save() already wrote localStorage.
  }

  async pull(): Promise<null> {
    return null;
  }

  subscribe(): () => void {
    return () => {};
  }

  getSyncInfo(): SyncInfo {
    return this.info;
  }

  onSyncInfo(): () => void {
    return () => {};
  }
}

interface SyncPayload {
  configured?: boolean;
  state?: DemoState | null;
  revision?: number;
  message?: string;
  conflict?: boolean;
}

const POLL_MS = 20_000;

export class SupabaseRepository implements StateRepository {
  readonly kind = "supabase" as const;
  private info: SyncInfo = {
    status: "connecting",
    detail: "Checking for a shared Supabase workspace…",
  };
  private infoListeners = new Set<(info: SyncInfo) => void>();
  private pending: DemoState | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight = false;
  private disabled = false;
  private lastPushedUpdatedAt: string | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private onRemote: ((state: DemoState | null) => void) | null = null;
  private listening = false;

  save(state: DemoState): boolean {
    return saveState(state);
  }

  private setInfo(patch: Partial<SyncInfo>): void {
    this.info = { ...this.info, ...patch };
    for (const listener of this.infoListeners) listener(this.info);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  async pull(): Promise<{ state: DemoState | null } | null> {
    if (this.disabled) return null;
    try {
      const response = await fetch("/api/sync", { cache: "no-store" });
      if (response.status === 503) {
        this.disabled = true;
        this.stopPolling();
        const payload = (await response.json().catch(() => ({}))) as SyncPayload;
        this.setInfo({
          status: "local",
          detail: payload.message ?? "Supabase isn't configured; data stays in this browser.",
        });
        return null;
      }
      if (!response.ok) {
        this.setInfo({
          status: "offline",
          detail: "Cloud sync is unreachable; changes are still saved in this browser.",
        });
        return null;
      }
      const payload = (await response.json()) as SyncPayload;
      this.setInfo({
        status: "synced",
        detail: "Synced with the shared Supabase workspace.",
        lastSyncedAt: new Date().toISOString(),
      });
      return { state: payload.state ?? null };
    } catch {
      this.setInfo({
        status: "offline",
        detail: "Cloud sync is unreachable; changes are still saved in this browser.",
      });
      return null;
    }
  }

  push(state: DemoState): void {
    if (this.disabled) return;
    if (state.updatedAt === this.lastPushedUpdatedAt) return;
    this.pending = state;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, 800);
  }

  private async flush(): Promise<void> {
    if (this.disabled || this.inFlight || !this.pending) return;
    const state = this.pending;
    this.pending = null;
    this.inFlight = true;
    try {
      const response = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state }),
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as SyncPayload;
      if (response.status === 503) {
        this.disabled = true;
        this.stopPolling();
        this.setInfo({
          status: "local",
          detail: payload.message ?? "Supabase isn't configured; data stays in this browser.",
        });
        return;
      }
      if (response.status === 409 && payload.state) {
        this.setInfo({
          status: "synced",
          detail: "Another device saved a newer version, so that version was loaded.",
        });
        this.onRemote?.(payload.state);
        return;
      }
      if (!response.ok) {
        this.setInfo({
          status: "offline",
          detail: "The last cloud save failed; changes are still in this browser.",
        });
        return;
      }
      this.lastPushedUpdatedAt = state.updatedAt;
      this.setInfo({
        status: "synced",
        detail: "Synced with the shared Supabase workspace.",
        lastSyncedAt: new Date().toISOString(),
      });
    } catch {
      this.setInfo({
        status: "offline",
        detail: "The last cloud save failed; changes are still in this browser.",
      });
    } finally {
      this.inFlight = false;
      if (this.pending) {
        this.timer = setTimeout(() => {
          this.timer = null;
          void this.flush();
        }, 800);
      }
    }
  }

  subscribe(onRemote: (state: DemoState | null) => void): () => void {
    this.onRemote = onRemote;
    if (this.disabled) return () => {};

    const probe = async () => {
      if (this.disabled) return;
      const result = await this.pull();
      if (result) this.onRemote?.(result.state);
    };

    if (!this.listening) {
      this.listening = true;
      void probe();
      this.pollTimer = setInterval(() => void probe(), POLL_MS);
      if (typeof window !== "undefined") {
        window.addEventListener("focus", probe);
      }
    }

    return () => {
      this.onRemote = null;
      this.stopPolling();
      if (typeof window !== "undefined") {
        window.removeEventListener("focus", probe);
      }
      this.listening = false;
    };
  }

  getSyncInfo(): SyncInfo {
    return this.info;
  }

  onSyncInfo(listener: (info: SyncInfo) => void): () => void {
    this.infoListeners.add(listener);
    return () => this.infoListeners.delete(listener);
  }
}

export function createStateRepository(): StateRepository {
  if (typeof window === "undefined") return new LocalRepository();
  // The server decides whether Supabase is configured; the first probe settles
  // it and falls back to local without flashing an error.
  return new SupabaseRepository();
}
