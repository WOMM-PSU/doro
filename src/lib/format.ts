/** Formatting helpers shared across the UI. */

import type { TravelMode } from "@/types";

export function formatMoney(cents: number, opts?: { compact?: boolean }): string {
  const safe = Number.isFinite(cents) ? Math.max(0, Math.round(cents)) : 0;
  const dollars = safe / 100;
  const hasCents = safe % 100 !== 0;
  if (opts?.compact && !hasCents) return `$${dollars.toFixed(0)}`;
  return `$${dollars.toFixed(2)}`;
}

export function formatHourly(cents: number): string {
  return `$${(Math.max(0, cents) / 100).toFixed(0)}/hr`;
}

export function formatMiles(miles: number): string {
  if (!Number.isFinite(miles) || miles < 0) return "—";
  if (miles < 0.1) return "<0.1 mi";
  return `${miles.toFixed(1)} mi`;
}

const TRAVEL_WORDS: Record<TravelMode, string> = {
  walk: "walk",
  bike: "bike ride",
  bus: "by bus",
  car: "drive",
};

/** "~6 min walk", "~4 min bike ride", "~9 min by bus", "~3 min drive". */
export function formatTravel(minutes: number, mode: TravelMode): string {
  return `~${minutes} min ${TRAVEL_WORDS[mode] ?? TRAVEL_WORDS.walk}`;
}

export function formatDuration(minutes: number): string {
  const safe = Math.max(1, Math.round(minutes));
  if (safe < 60) return `${safe} min`;
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return `${count} ${count === 1 ? singular : plural ?? `${singular}s`}`;
}

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function roundToNearest(value: number, step: number): number {
  return Math.round(value / step) * step;
}
