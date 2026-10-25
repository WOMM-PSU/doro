# Doro — Remaining Work

This is the handoff list for the next agent working on Doro. Work through the features in order. Before you build a feature, ask the user how they want it, following the "Ask first" notes. After each feature: run `npm run typecheck && npm test && npm run build`, commit, and push to `origin/main`.

## Project context

- Stack: Next.js 15 (App Router), TypeScript (strict), Tailwind, Lucide, Vitest.
- All marketplace rules live in [`src/features/store.ts`](src/features/store.ts) (`DemoStore`). UI components call store methods only and must never touch `localStorage` directly. Persistence goes through [`src/lib/persistence.ts`](src/lib/persistence.ts).
- Domain types are in [`src/types/index.ts`](src/types/index.ts). Seed data is in [`src/features/seed.ts`](src/features/seed.ts).
- Demo personas: Maya (`u-maya`), Jordan (`u-jordan`), Alex (`u-alex`), Sam (`u-sam`). Use the persona switcher to test both sides of a task.
- The app has to keep running with zero env vars. Any external API needs a working local fallback.
- Git: pushes to `WOMM-PSU/doro` need the noreply email (`212098084+jatinsrivastava11@users.noreply.github.com`), which is already set in the local repo config.
- Dev server: `npm run dev`. Port 3000 is often taken on this machine, so the server usually ends up on http://localhost:3001.

---

## Done

- [x] Real Leaflet street map plus a Campus Grid blueprint mode ([`map-panel.tsx`](src/components/map-panel.tsx)), and the fix for switching back from Grid to Street.
- [x] Car travel mode added to preferences (walk / bike / bus / car).
- [x] **Feature 1: Payments.** Stripe card escrow API routes (`/api/stripe/payment-intent`, `/capture`, `/refund`) with a `pi_doro_…` test fallback, a Cash at Handoff option, and a payout breakdown (reward + expenses + $0 campus fee). Also fixed the label overlap on the Expenses field.
  - Live Stripe only runs when `STRIPE_SECRET_KEY` is set in `.env`.
  - Follow-up (optional): add Stripe Elements / a card-entry UI on the client. Right now the PaymentIntent is created server-side but never confirmed with a real card.

---

## Feature 2: Smart content moderation (AI filtering). Next up

**The user has already decided:** a smart local client-side NLP classifier. No API keys. It should use semantic phrase matching and sentiment risk scoring.

**The user said "make a sensible choice yourself" for the UI scope.** Recommended:
- [ ] Replace or extend the regex rules in [`src/features/moderation.ts`](src/features/moderation.ts) with a scored classifier:
  - Normalize text (lowercase, strip punctuation, undo leetspeak like `w33d` → `weed` and `4dderall` → `adderall`, collapse repeated letters).
  - Weighted phrase/intent lexicons per category: academic dishonesty ("take my quiz", "write my essay", "answers for", "log into my canvas"), substances, weapons, paid rides, off-platform payment, harassment, contact-info sharing, and scams/links.
  - Fuzzy matching (Levenshtein ≤ 1 on tokens of 5+ characters) to catch typos.
  - Return `{ riskScore: 0–100, level: "allow" | "warn" | "block", reasons: string[], suggestions: string[] }`.
- [ ] Task composer ([`post-task.tsx`](src/components/post-task.tsx)): show a live inline warning banner while the user types, with rewrite tips. Block publishing at the `block` level.
- [ ] Task chat ([`task-detail.tsx`](src/components/task-detail.tsx), `sendMessage` in the store): warn on phone numbers, emails, Venmo/CashApp handles, "pay me outside the app", and harassment.
- [ ] Keep `detectProhibitedRequest` backward compatible, since `validateTaskDraft` in the store calls it.
- [ ] Unit tests in `src/features/moderation.test.ts` covering obvious, obfuscated, and false-positive-safe cases (e.g. "carry my wine rack" or "grab my prescription glasses" should not be hard-blocked).

---

## Feature 3: AI task parsing, pricing, and learned matching

**Ask first:** local-only heuristics or an optional LLM endpoint? Should the price model learn from completed tasks?
- [ ] Natural-language composer: e.g. "Bring my charger from Pattee to East Halls by 4pm for $6" auto-fills category, pickup/drop-off, deadline, duration, and reward. Extend [`src/features/task-suggestions.ts`](src/features/task-suggestions.ts).
- [ ] Pricing that adjusts from historical accepted/completed rewards per category (in [`src/features/pricing.ts`](src/features/pricing.ts)).
- [ ] Optionally tune match weights in [`src/features/matching.ts`](src/features/matching.ts) from acceptance history. Keep the explanations honest.

## Feature 4: Real database, backend API, and multi-device sync

**Ask first:** Supabase vs. SQLite/Prisma vs. another option? Realtime needed?
- [ ] Add a repository interface so `DemoStore` can swap localStorage for a server backend without changing UI components.
- [ ] API routes or Supabase tables for tasks, offers, messages, notifications, payments, and reviews.
- [ ] Realtime updates (Supabase Realtime / WebSockets / polling fallback).
- [ ] Keep the zero-config localStorage mode as the default.

## Feature 5: Penn State authentication and identity verification

**Ask first:** `@psu.edu` email OTP/magic link vs. Microsoft Entra SSO vs. NextAuth?
- [ ] Real sign-in, replacing the persona dropdown in production mode. Keep the persona switcher in demo mode.
- [ ] Derive the `verified` badge from a verified `.edu` email instead of the static seed flag.

## Feature 6: Live GPS, real routing, and geofencing

**Ask first:** browser geolocation only, or also live helper tracking? Which routing provider (OSRM public / Mapbox / none)?
- [ ] `navigator.geolocation` for "near me" distance, with consent and a fallback to the home location.
- [ ] Real walk/bike/drive routes (OSRM) drawn on the Leaflet map in place of the straight dashed line. CATA bus can be approximated.
- [ ] Optional live helper location sharing during `IN_PROGRESS`, and a geofenced "arrived" prompt.

## Feature 7: Photo proof and receipt uploads

**Ask first:** local-only (base64 / IndexedDB) for the demo, or object storage (Supabase Storage / S3)?
- [ ] Helper attaches a drop-off photo when marking ready, and a receipt image for expense reimbursement.
- [ ] Requester sees the attachments in the task detail before confirming. Size and type validation.

## Feature 8: Push, SMS, and email notifications

**Ask first:** Web Push only, or also Twilio SMS / Resend email (both optional via env)?
- [ ] Web Push (service worker + VAPID) for high-match tasks, offers, accepted tasks, and ready-to-confirm.
- [ ] Respect existing quiet hours and the `notifyMatches` preference.
- [ ] Optional SMS/email providers behind env vars, with in-app notifications kept as the fallback.

---

## Housekeeping

- [ ] Add a README section covering `.env` keys (`STRIPE_SECRET_KEY`, `NEXT_PUBLIC_CARTO_API_KEY`, plus any added later) and the fact that everything works without them.
- [ ] Bump `CURRENT_STATE_VERSION` (in persistence/seed) whenever the persisted shape changes, so old localStorage data gets reset cleanly.
