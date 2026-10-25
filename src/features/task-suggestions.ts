/**
 * Deterministic, rule-based form suggestions. No language model is involved;
 * the UI labels these as estimates from the words typed.
 */

import type { TaskCategory } from "@/types";

export interface TaskInference {
  category: TaskCategory;
  estimatedMinutes: number;
  reason: string;
}

const RULES: { pattern: RegExp; category: TaskCategory; minutes: number }[] = [
  { pattern: /\b(move|moving|boxes?|desk|fridge|furniture|carry|lift|assemble)\b/i, category: "moving", minutes: 35 },
  { pattern: /\b(calculus|tutor|tutoring|study|midterm|problem set|homework help|math)\b/i, category: "tutoring", minutes: 45 },
  { pattern: /\b(python|code|coding|debug|error|wifi|laptop|printer|software|tech)\b/i, category: "tech", minutes: 30 },
  { pattern: /\b(deliver|delivery|drop off|drop-off|bring|package|pick up|pickup)\b/i, category: "delivery", minutes: 15 },
  { pattern: /\b(charger|umbrella|coffee|shop|store|errand|buy|return|stationery)\b/i, category: "errands", minutes: 20 },
];

export function inferTaskDetails(text: string): TaskInference | null {
  const trimmed = text.trim();
  if (trimmed.length < 10) return null;
  for (const rule of RULES) {
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
