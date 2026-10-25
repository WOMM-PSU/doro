/**
 * Local, explainable content moderation.
 *
 * No network calls and no API keys: text is normalized (case, leetspeak,
 * inflated letters, punctuation) and scored against weighted intent phrases.
 * The result always includes the reasons and rewrite suggestions shown in the
 * UI, so a warning never feels arbitrary.
 */

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

export type ModerationLevel = "allow" | "warn" | "block";

export interface ModerationResult {
  riskScore: number;
  level: ModerationLevel;
  reasons: string[];
  suggestions: string[];
  categories: string[];
}

interface Signal {
  id: string;
  label: string;
  category: string;
  weight: number;
  patterns: RegExp[];
  suggestion: string;
  /** Phrases that neutralize a match in a harmless context. */
  exceptions?: RegExp[];
}

const SIGNALS: Signal[] = [
  {
    id: "academic",
    label: "academic cheating or impersonation",
    category: "Academic integrity",
    weight: 60,
    patterns: [
      /\b(write|do|take|complete|finish) (my|the|his|her|their) (?:[\w-]+ ){0,2}(essay|exam|quiz|test|homework|assignment|problem set|midterm|final)\b/,
      /\b(take|do|write|complete|finish)\b.{0,40}\b(exam|quiz|midterm|final|assignment|essay|homework|problem set)\b.{0,20}\bfor me\b/,
      /\b(exam|quiz|test|homework) (answers|solutions|key)\b/,
      /\blog ?in to (my|their|his|her) (canvas|webwork|lon ?capa|email|account)\b/,
      /\b(cheat|cheating)\b/,
      /\bfake (id|student id)\b/,
      /\bimpersonate\b/,
    ],
    suggestion:
      "Offer tutoring or study help instead of doing someone's graded work. Describe what you'll explain, not what you'll submit.",
  },
  {
    id: "substances",
    label: "alcohol or controlled substances",
    category: "Substances",
    weight: 55,
    patterns: [
      /\b(buy|sell|get|deliver|pick up|bring|find) (me )?(some )?(weed|cannabis|edibles|vape|vapes|pods|alcohol|beer|liquor|vodka|whiskey|wine|adderall|xanax|oxycodone|oxy|percocet|cocaine|molly|shrooms)\b/,
      /\b(weed|cannabis|edibles|vape|adderall|xanax|oxycodone|cocaine|molly|shrooms)\b/,
      /\bfake id\b/,
    ],
    exceptions: [
      /\b(prescription|medication|pharmacy) (pickup|pick up|refill|drop ?off)\b/,
      /\bprescription glasses\b/,
      /\bwine (rack|glass|glasses|opener)\b/,
      /\bbeer (pong|goggles)\b/,
    ],
    suggestion:
      "Doro can't help buy, sell, carry, or deliver alcohol, nicotine, cannabis, or controlled medication. Remove the item and repost.",
  },
  {
    id: "weapons",
    label: "weapons or hazardous materials",
    category: "Weapons",
    weight: 65,
    patterns: [
      /\b(gun|firearm|handgun|rifle|shotgun|pistol|ammo|ammunition|explosive|fireworks?|hazardous|acid|bleach mix)\b/,
      /\b(knife|blade|taser|pepper spray) (for|to) (someone|fight|attack)\b/,
    ],
    exceptions: [
      /\b(water|nerf|paintball|airsoft|toy) (gun|blaster|rifle)\b/,
      /\bgun (safe|cabinet|lock|case)\b/,
      /\b(fireworks?|hazardous) (safety|training|class|disposal)\b/,
    ],
    suggestion:
      "Weapons, ammunition, fireworks, and hazardous materials aren't allowed on Doro, even for moving or storage.",
  },
  {
    id: "rides",
    label: "paid passenger rides",
    category: "Paid rides",
    weight: 55,
    patterns: [
      /\b(ride|drive|drive me|take me|taxi|uber|lyft) (me )?(to|from|home|airport|downtown|the mall|class)\b/,
      /\b(paid|private) ride\b/,
      /\b(drive|chauffeur) (me|my friend)\b/,
      /\bairport (ride|run|pickup|drop ?off)\b/,
    ],
    exceptions: [/\b(bike|scooter|skateboard) (ride|repair|fix)\b/],
    suggestion:
      "Doro handles tasks, not passenger transport. If you need something carried, post a pickup-and-delivery task instead.",
  },
  {
    id: "medical",
    label: "medical emergencies or licensed care",
    category: "Medical",
    weight: 60,
    patterns: [
      /\b(chest pain|overdose|bleeding|broken bone|stitches|seizure|can'?t breathe)\b/,
      /\b(prescribe|diagnose|medical advice)\b/,
    ],
    suggestion:
      "For anything urgent or medical, contact emergency services or a clinician. Doro can't dispatch medical care.",
  },
  {
    id: "licensed",
    label: "work that needs a professional license",
    category: "Licensed services",
    weight: 35,
    patterns: [
      /\b(legal advice|notarize|tax (return|prep)|electrical (work|wiring)|plumbing|roof repair|therapy session)\b/,
    ],
    suggestion:
      "Keep the request to everyday tasks. Licensed legal, medical, tax, and construction work needs a qualified professional.",
  },
  {
    id: "off_platform",
    label: "moving payment off the platform",
    category: "Off-platform payment",
    weight: 40,
    patterns: [
      /\b(pay|paid) (me )?(outside|off) (the app|doro)\b/,
      /\b(venmo|cash ?app|zelle|paypal|apple cash)\b/,
      /\b(cash only|no receipt|under the table)\b/,
    ],
    suggestion:
      "Keep the reward inside Doro so both sides keep the task record, handoff code, and dispute history.",
  },
  {
    id: "contact",
    label: "sharing personal contact details",
    category: "Contact info",
    weight: 30,
    patterns: [
      /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/,
      /\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/,
      /\b(instagram|insta|snap|snapchat|discord|telegram|whatsapp)\s*[:@]?\s*[\w.]{2,}/,
    ],
    suggestion:
      "Keep personal phone numbers, emails, and social handles out of the post. Doro opens a private task chat after someone accepts.",
  },
  {
    id: "harassment",
    label: "harassment or threats",
    category: "Harassment",
    weight: 55,
    patterns: [
      /\b(kill|hurt|attack|jump|beat) (you|him|her|them|someone)\b/,
      /\b(death threat|threaten|intimidate)\b/,
      /\b(dox|doxx|leak) (their|her|his|your) (address|info|photos)\b/,
      /\b(worthless|subhuman|slur)\b/,
    ],
    suggestion:
      "Rewrite the message around the task itself. Threats and degrading language are removed and can suspend the account.",
  },
  {
    id: "scam",
    label: "scams, links, or upfront payment",
    category: "Scams",
    weight: 30,
    patterns: [
      /\b(https?:\/\/|www\.)\S+/,
      /\b(gift card|wire transfer|western union|bitcoin|crypto|usdt)\b/,
      /\b(deposit|upfront|advance) (fee|payment)\b/,
      /\b(click|follow) (this|the) link\b/,
    ],
    suggestion:
      "Remove links and upfront-payment requests. Doro never asks anyone to pay a deposit before a task is accepted.",
  },
];

const LEETSPEAK: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "8": "b",
  "@": "a",
  $: "s",
};

/** Collapse single-letter runs like "w e e d" back into a word. */
function collapseSpacedLetters(value: string): string {
  return value.replace(/\b(?:[a-z]\s){3,}[a-z]\b/g, (match) => match.replace(/\s+/g, ""));
}

export function normalizeText(input: string): string {
  let text = input.normalize("NFKC").toLowerCase();
  text = collapseSpacedLetters(text);
  // Apply leetspeak word by word so phone numbers, prices, emails and links
  // keep their digits and punctuation intact.
  text = text.replace(/[^\s]+/g, (word) => {
    if (/^\d+$/.test(word) || /\d{3,}/.test(word) || /[@/:]/.test(word) || /^https?$/.test(word)) {
      return word;
    }
    return word.replace(/[0134578@$]/g, (char) => LEETSPEAK[char] ?? char);
  });
  // Repeated characters are noise: "w33eed" -> "weed", "loooove" -> "love".
  text = text.replace(/([a-z])\1{2,}/g, "$1");
  text = text.replace(/[^\w\s@.:/+'-]/g, " ");
  text = text.replace(/\s+/g, " ").trim();
  return text;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 2) return Math.max(a.length, b.length);
  const rows = a.length + 1;
  const cols = b.length + 1;
  const previous = new Array<number>(cols);
  const current = new Array<number>(cols);
  for (let j = 0; j < cols; j += 1) previous[j] = j;
  for (let i = 1; i < rows; i += 1) {
    current[0] = i;
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
    }
    for (let j = 0; j < cols; j += 1) previous[j] = current[j];
  }
  return previous[cols - 1];
}

/**
 * Tolerates typos in longer words ("presciption", "addreall"). Only 5+ letter
 * tokens are compared so short words cannot create noisy matches.
 */
function fuzzyHit(tokens: string[], target: string): boolean {
  if (target.length < 5 || target.includes(" ")) return false;
  return tokens.some(
    (token) =>
      token.length >= 5 &&
      Math.abs(token.length - target.length) <= 2 &&
      levenshtein(token, target) <= (target.length >= 7 ? 2 : 1),
  );
}

export function analyzeContent(raw: string): ModerationResult {
  const text = normalizeText(raw);
  const tokens = text.split(" ").filter(Boolean);
  const reasons: string[] = [];
  const suggestions = new Set<string>();
  const categories = new Set<string>();
  let score = 0;

  for (const signal of SIGNALS) {
    if (signal.exceptions?.some((pattern) => pattern.test(text))) continue;
    const phraseMatch = signal.patterns.some((pattern) => pattern.test(text));
    if (!phraseMatch) continue;
    // A single weak signal should warn, not block. Repeated signals compound.
    score += signal.weight;
    reasons.push(signal.label);
    suggestions.add(signal.suggestion);
    categories.add(signal.category);
  }

  // Fuzzy pass for the few high-signal words people commonly misspell.
  for (const word of ["adderall", "oxycodone", "cocaine"]) {
    if (!tokens.includes(word) && fuzzyHit(tokens, word)) {
      score += 60;
      reasons.push("controlled substances");
      suggestions.add("Doro can't help with controlled medication or substances.");
      categories.add("Substances");
    }
  }

  score = Math.min(100, score);
  const level: ModerationLevel = score >= 55 ? "block" : score >= 20 ? "warn" : "allow";

  return {
    riskScore: score,
    level,
    reasons: Array.from(new Set(reasons)),
    suggestions: Array.from(suggestions),
    categories: Array.from(categories),
  };
}

/** Chat is allowed to mention contact details, but should warn about them. */
export function analyzeMessage(raw: string): ModerationResult {
  const result = analyzeContent(raw);
  if (result.level === "allow" && result.riskScore > 0) {
    return { ...result, level: "warn" };
  }
  return result;
}

/**
 * Backward-compatible helper used by `validateTaskDraft`. It returns a label
 * only for blocking content, so harmless mentions (a wine rack, a toy gun)
 * don't reject a valid task.
 */
export function detectProhibitedRequest(text: string): string | null {
  const result = analyzeContent(text);
  return result.level === "block" ? (result.reasons[0] ?? "this request") : null;
}
