/** Time helpers. Timestamps are ISO strings; the UI renders them locally. */

export function nowIso(): string {
  return new Date().toISOString();
}

export function minutesUntil(iso: string, now: Date = new Date()): number {
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return 0;
  return Math.round((target - now.getTime()) / 60000);
}

export function isPast(iso: string, now: Date = new Date()): boolean {
  return minutesUntil(iso, now) <= 0;
}

export function hoursFromNow(hours: number, now: Date = new Date()): string {
  return new Date(now.getTime() + hours * 3_600_000).toISOString();
}

export function minutesFromNow(minutes: number, now: Date = new Date()): string {
  return new Date(now.getTime() + minutes * 60_000).toISOString();
}

export function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function atLocalTime(base: Date, hour: number, minute = 0, dayOffset = 0): Date {
  const copy = new Date(base);
  copy.setDate(copy.getDate() + dayOffset);
  copy.setHours(hour, minute, 0, 0);
  return copy;
}

/** e.g. "Today · 4:30 PM" or "Tomorrow · 6:00 PM" or "Mon, Oct 27 · 6:00 PM" */
export function formatDeadline(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "No deadline";
  if (date.getTime() <= now.getTime()) return "Deadline passed";
  const remaining = minutesUntil(iso, now);
  // Near-term deadlines read more naturally as a duration than as a clock time
  // (a campus errand due after midnight shouldn't look like a 3 AM appointment).
  if (remaining <= 360) {
    const rounded = Math.max(5, Math.round(remaining / 5) * 5);
    if (rounded < 60) return `In about ${rounded} min`;
    const hours = Math.floor(rounded / 60);
    const rest = rounded % 60;
    return rest < 15 ? `In about ${hours}h` : `In about ${hours}h ${rest}m`;
  }
  const today = startOfDay(now);
  const target = startOfDay(date);
  const dayDiff = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (dayDiff === 0) return `Today · ${time}`;
  if (dayDiff === 1) return `Tomorrow · ${time}`;
  const day = date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  return `${day} · ${time}`;
}

export function formatShortDeadline(iso: string, now: Date = new Date()): string {
  const minutes = minutesUntil(iso, now);
  if (minutes <= 0) return "Passed";
  if (minutes < 60) return `${minutes} min left`;
  if (minutes < 24 * 60) {
    const hours = Math.round(minutes / 60);
    return `${hours}h left`;
  }
  return formatDeadline(iso, now);
}

/** Time left before a deadline in the largest sensible unit: "20 min left", "3h 15m left", "2 days left". */
export function formatTimeLeft(iso: string, now: Date = new Date()): string {
  const minutes = minutesUntil(iso, now);
  if (minutes <= 0) return "Deadline passed";
  if (minutes < 60) return `${minutes} min left`;
  if (minutes < 24 * 60) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest < 15 ? `${hours}h left` : `${hours}h ${rest}m left`;
  }
  const days = Math.floor(minutes / (24 * 60));
  const hours = Math.floor((minutes % (24 * 60)) / 60);
  if (days < 3 && hours > 0) return `${days} ${days === 1 ? "day" : "days"} ${hours}h left`;
  return `${days} ${days === 1 ? "day" : "days"} left`;
}

export function formatRelative(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const diff = Math.round((now.getTime() - date.getTime()) / 60000);
  if (diff < 1) return "just now";
  if (diff < 60) return `${diff}m ago`;
  if (diff < 24 * 60) return `${Math.floor(diff / 60)}h ago`;
  if (diff < 48 * 60) return "yesterday";
  if (diff < 7 * 24 * 60) return `${Math.floor(diff / (24 * 60))}d ago`;
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatTimeOnly(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function greeting(now: Date = new Date()): string {
  const hour = now.getHours();
  if (hour < 5) return "Working late";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function isUrgentDeadline(iso: string, now: Date = new Date()): boolean {
  const minutes = minutesUntil(iso, now);
  return minutes > 0 && minutes <= 180;
}

export function inQuietHours(hour: number, start: number, end: number): boolean {
  if (start === end) return false;
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}

/** ISO value suitable for a datetime-local input, in the browser's timezone. */
export function toDateTimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

export function fromDateTimeLocalValue(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}
