/** Lightweight, rule-based trust features for the demo. */

export const REPORT_REASONS = [
  "Unsafe or prohibited request",
  "No-show or unresponsive",
  "Inappropriate message",
  "Spam or misleading task",
  "Something else",
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

export const PROHIBITED_CATEGORIES = [
  "Illegal goods and activities",
  "Alcohol or controlled substances",
  "Weapons and hazardous materials",
  "Academic cheating or impersonation",
  "Medical emergencies",
  "Licensed professional services",
  "Paid passenger rides",
];

const PROHIBITED_RULES: { pattern: RegExp; label: string }[] = [
  {
    pattern:
      /\b(alcohol|beer|liquor|vodka|whiskey|wine|vape|vaping|weed|cannabis|edibles|xanax|adderall|oxycodone|prescription)\b/i,
    label: "alcohol or controlled substances",
  },
  {
    pattern: /\b(gun|firearm|weapon|ammo|ammunition|explosive|hazardous)\b/i,
    label: "weapons or hazardous materials",
  },
  {
    pattern:
      /\b(cheat|cheating|exam answers|test answers|write my (exam|essay)|do my (exam|homework|assignment)|fake id)\b/i,
    label: "academic cheating or impersonation",
  },
  {
    pattern: /\b(ride to|drive me|airport ride|paid ride|taxi me)\b/i,
    label: "paid passenger rides",
  },
  {
    pattern: /\b(medical emergency|chest pain|overdose|stitches|prescribe)\b/i,
    label: "medical emergencies or licensed care",
  },
];

/** Returns the matched prohibition label, or null when the text is allowed. */
export function detectProhibitedRequest(text: string): string | null {
  for (const rule of PROHIBITED_RULES) {
    if (rule.pattern.test(text)) return rule.label;
  }
  return null;
}
