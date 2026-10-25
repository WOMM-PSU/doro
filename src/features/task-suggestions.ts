/**
 * Deterministic task parsing.
 *
 * This module is the always-available fallback for the on-device assistant:
 * it reads one sentence ("Bring my charger from Pattee to East Halls by 4pm
 * for $6") and fills category, places, deadline, duration and reward. The UI
 * can upgrade the parse with a browser-local language model when one exists.
 */

import type { TaskCategory } from "@/types";
import { LOCATIONS } from "@/lib/locations";

export interface TaskInference {
  category: TaskCategory;
  estimatedMinutes: number;
  reason: string;
}

export interface ParsedTaskSentence {
  title?: string;
  description?: string;
  category: TaskCategory;
  locationId?: string;
  dropoffLocationId?: string;
  deadline?: string;
  estimatedMinutes: number;
  rewardCents?: number;
  confidence: "high" | "medium" | "low";
  source: "local-llm" | "rules";
  notes: string[];
}

const CATEGORY_RULES: { pattern: RegExp; category: TaskCategory; minutes: number }[] = [
  { pattern: /\b(move|moving|boxes?|desk|fridge|furniture|carry|lift|assemble|dorm)\b/i, category: "moving", minutes: 35 },
  { pattern: /\b(calculus|tutor|tutoring|study|midterm|problem set|homework help|math|chemistry|physics)\b/i, category: "tutoring", minutes: 45 },
  { pattern: /\b(python|code|coding|debug|error|wifi|laptop|printer|software|tech|password)\b/i, category: "tech", minutes: 30 },
  { pattern: /\b(deliver|delivery|drop off|drop-off|bring|package|pick up|pickup|return|take)\b/i, category: "delivery", minutes: 15 },
  { pattern: /\b(charger|umbrella|coffee|shop|store|errand|buy|stationery|notebook|prescription)\b/i, category: "errands", minutes: 20 },
];

const LOCATION_ALIASES: { id: string; aliases: string[] }[] = [
  { id: "hub", aliases: ["hub-robeson", "hub robeson", "the hub", "hub", "robeson", "student union"] },
  { id: "pattee", aliases: ["pattee & paterno", "pattee and paterno", "pattee", "paterno", "library", "libraries"] },
  { id: "west-halls", aliases: ["west halls", "west hall", "west"] },
  { id: "pollock-halls", aliases: ["pollock halls", "pollock hall", "pollock"] },
  { id: "east-halls", aliases: ["east halls", "east hall", "east"] },
  { id: "south-halls", aliases: ["south halls", "south hall", "south"] },
  { id: "north-halls", aliases: ["north halls", "north hall", "north"] },
  { id: "willard", aliases: ["willard building", "willard"] },
  { id: "kern", aliases: ["kern building", "kern"] },
  { id: "findlay", aliases: ["findlay commons", "findlay"] },
  { id: "downtown", aliases: ["downtown state college", "downtown", "college ave", "state college"] },
  { id: "redifer", aliases: ["redifer commons", "redifer"] },
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Finds a location mentioned in text, preferring the longest alias. */
export function findLocationInText(text: string): { id: string; index: number } | null {
  const lower = text.toLowerCase();
  let best: { id: string; index: number; length: number } | null = null;
  for (const location of LOCATION_ALIASES) {
    for (const alias of location.aliases) {
      const pattern = new RegExp(`\\b${escapeRegExp(alias)}\\b`, "i");
      const match = pattern.exec(lower);
      if (!match) continue;
      if (!best || match.index < best.index || (match.index === best.index && alias.length > best.length)) {
        best = { id: location.id, index: match.index, length: alias.length };
      }
    }
  }
  return best ? { id: best.id, index: best.index } : null;
}

function findAllLocationMentions(text: string): string[] {
  const matches: { id: string; index: number }[] = [];
  const lower = text.toLowerCase();
  for (const location of LOCATION_ALIASES) {
    let earliest = Number.POSITIVE_INFINITY;
    for (const alias of location.aliases) {
      const match = new RegExp(`\\b${escapeRegExp(alias)}\\b`, "i").exec(lower);
      if (match) earliest = Math.min(earliest, match.index);
    }
    if (Number.isFinite(earliest)) matches.push({ id: location.id, index: earliest });
  }
  return matches.sort((a, b) => a.index - b.index).map((m) => m.id);
}

export function inferTaskDetails(text: string): TaskInference | null {
  const trimmed = text.trim();
  if (trimmed.length < 10) return null;
  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(trimmed)) {
      return {
        category: rule.category,
        estimatedMinutes: rule.minutes,
        reason: `Looks like ${rule.category === "tech" ? "tech help" : rule.category}. Suggested ${rule.minutes} minutes.`,
      };
    }
  }
  return null;
}

function inferCategory(text: string): TaskCategory {
  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(text)) return rule.category;
  }
  return "other";
}

function inferMinutes(text: string, category: TaskCategory): number {
  const explicit = /\b(\d{1,3})\s*(?:min|mins|minutes)\b/i.exec(text);
  if (explicit) {
    const value = Number(explicit[1]);
    if (Number.isFinite(value)) return Math.min(240, Math.max(5, value));
  }
  const hours = /\b(\d{1,2})\s*(?:hours?|hrs?)\b/i.exec(text);
  if (hours) {
    const value = Number(hours[1]) * 60;
    if (Number.isFinite(value)) return Math.min(240, Math.max(5, value));
  }
  if (/\bquick\b|\bmoment\b|\bjust\b/i.test(text)) return 10;
  if (/\bheavy\b|\bfridge\b|\bcouch\b|\bseveral boxes\b/i.test(text)) return 45;
  return CATEGORY_RULES.find((rule) => rule.category === category)?.minutes ?? 20;
}

function inferReward(text: string): number | undefined {
  const dollar = /(?:\$\s*(\d{1,4}(?:\.\d{1,2})?))|(?:\b(\d{1,4}(?:\.\d{1,2})?)\s*(?:dollars?|bucks|usd)\b)/i.exec(text);
  const raw = dollar?.[1] ?? dollar?.[2];
  if (!raw) return undefined;
  const cents = Math.round(Number(raw) * 100);
  if (!Number.isFinite(cents) || cents < 100 || cents > 100_000) return undefined;
  return Math.round(cents / 50) * 50;
}

function setTime(date: Date, hours: number, minutes: number): Date {
  const next = new Date(date);
  next.setHours(hours, minutes, 0, 0);
  return next;
}

function inferDeadline(text: string, now: Date): string | undefined {
  const lower = text.toLowerCase();
  const clock = /\b(?:by|before|at|around)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i.exec(lower);
  const noon = /\b(?:by|before|at)\s+noon\b/i.test(lower);
  const tomorrow = /\btomorrow\b/i.test(lower);
  const today = /\btoday\b/i.test(lower);
  const relative = /\bin\s+(\d{1,3})\s*(min|mins|minutes|hour|hours|hr|hrs)\b/i.exec(lower);

  if (relative) {
    const value = Number(relative[1]);
    const unit = relative[2].startsWith("h") ? 60 : 1;
    return new Date(now.getTime() + value * unit * 60_000).toISOString();
  }

  if (clock || noon) {
    let hours = noon ? 12 : Number(clock?.[1]);
    let minutes = noon ? 0 : Number(clock?.[2] ?? 0);
    if (!noon && clock?.[3]) {
      const isPm = clock[3].toLowerCase() === "pm";
      if (isPm && hours < 12) hours += 12;
      if (!isPm && hours === 12) hours = 0;
    } else if (!noon && clock && hours <= 7 && !today) {
      // "by 4" in the afternoon is far more likely on a campus task.
      hours += 12;
    }
    if (hours > 23 || minutes > 59) return undefined;
    let date = setTime(now, hours, minutes);
    if (tomorrow) date = new Date(date.getTime() + 86_400_000);
    if (!tomorrow && date.getTime() - now.getTime() < 5 * 60_000) {
      date = new Date(date.getTime() + 86_400_000);
    }
    return date.toISOString();
  }

  if (tomorrow) {
    const date = setTime(now, 18, 0);
    date.setDate(date.getDate() + 1);
    return date.toISOString();
  }

  return undefined;
}

function inferTitle(text: string): string {
  let title = text
    .replace(/\s+(?:by|before|at|around)\s+[^,.]*$/i, "")
    .replace(/\s+for\s+\$?\d[^,.]*$/i, "")
    .trim();
  title = title.replace(/^please\s+/i, "");
  if (title.length > 90) title = `${title.slice(0, 87).trimEnd()}…`;
  return title.charAt(0).toUpperCase() + title.slice(1);
}

export function parseTaskSentence(
  raw: string,
  options: { now?: Date } = {},
): ParsedTaskSentence | null {
  const text = raw.trim();
  if (text.length < 8) return null;
  const now = options.now ?? new Date();
  const category = inferCategory(text);
  const notes: string[] = [];

  const fromTo = /\bfrom\s+(.+?)\s+to\s+(.+?)(?=\s+(?:by|before|at|around|for|with|and)\b|[,.]|$)/i.exec(text);
  let locationId: string | undefined;
  let dropoffLocationId: string | undefined;

  if (fromTo) {
    locationId = findLocationInText(fromTo[1])?.id;
    dropoffLocationId = findLocationInText(fromTo[2])?.id;
    if (locationId) notes.push("Read the pickup and drop-off from “from … to …”.");
  }
  if (!locationId || !dropoffLocationId) {
    const mentions = findAllLocationMentions(text);
    if (!locationId && mentions[0]) locationId = mentions[0];
    if (!dropoffLocationId && mentions[1] && mentions[1] !== locationId) {
      dropoffLocationId = mentions[1];
    }
  }
  if (dropoffLocationId && locationId === dropoffLocationId) dropoffLocationId = undefined;
  if (dropoffLocationId) notes.push("Two places found, so this is treated as a delivery.");

  const deadline = inferDeadline(text, now);
  if (deadline) notes.push("Converted the time in your sentence to a deadline.");

  const rewardCents = inferReward(text);
  if (rewardCents) notes.push("Picked up the reward amount.");

  const estimatedMinutes = inferMinutes(text, category);
  const location = LOCATIONS.find((item) => item.id === (locationId ?? dropoffLocationId));

  return {
    title: inferTitle(text),
    description: text,
    category: dropoffLocationId ? (category === "other" ? "delivery" : category) : category,
    locationId: locationId ?? location?.id,
    dropoffLocationId,
    deadline,
    estimatedMinutes,
    rewardCents,
    confidence:
      (locationId ? 1 : 0) + (dropoffLocationId ? 1 : 0) + (deadline ? 1 : 0) + (rewardCents ? 1 : 0) >= 3
        ? "high"
        : (locationId ? 1 : 0) + (deadline ? 1 : 0) + (rewardCents ? 1 : 0) >= 2
          ? "medium"
          : "low",
    source: "rules",
    notes,
  };
}
