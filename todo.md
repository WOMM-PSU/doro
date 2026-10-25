# Doro — Demo → Real Handoff

Everything below still runs on demo data or isn't part of a real, production site. Work through the items in order. If an item has an **Ask first** note, ask the user before building it. After each item: run `npm run typecheck && npm test && npm run build`, commit, and push to `origin/main`.

## Project context

- Stack: Next.js 15 (App Router), TypeScript (strict), Tailwind, Lucide, Leaflet, Vitest.
- All marketplace rules live in [`src/features/store.ts`](src/features/store.ts) (`DemoStore`). UI components call store methods only and never touch `localStorage` directly. Persistence goes through [`src/lib/persistence.ts`](src/lib/persistence.ts).
- Domain types: [`src/types/index.ts`](src/types/index.ts). Seed data: [`src/features/seed.ts`](src/features/seed.ts). Bump `CURRENT_STATE_VERSION` there whenever the persisted shape changes in a breaking way.
- The app must keep running with zero env vars. Every real integration needs a working local fallback, and demo mode stays available.
- Git: pushes to `WOMM-PSU/doro` need the noreply email (`212098084+jatinsrivastava11@users.noreply.github.com`), which is already set in the local repo config.
- Dev server: `npm run dev`. Port 3000 is often taken, so the server usually runs on http://localhost:3001.

---

## 1. Data storage and sync

**Now:** All data is seeded and stored in browser `localStorage` (`doro.demo.state`). It resets after 24 hours (`RESEED_AFTER_HOURS`) and isn't shared between users or devices.
**Files:** `persistence.ts`, `seed.ts`, `store.ts`.
**Ask first:** Supabase, SQLite/Prisma, or something else? Is realtime needed?
- [ ] Add a repository interface so `DemoStore` can switch between localStorage and a server backend without changing UI components.
- [ ] Add tables or API routes for users, tasks, offers, messages, notifications, payments, reviews, reports and events.
- [ ] Add realtime updates (Supabase Realtime, WebSockets, or polling as a fallback).
- [ ] In production mode, start from an empty database instead of the seed. Keep the 24-hour reseed for demo mode only.

## 2. Users and login

**Now:** There is no sign-in. A persona switcher picks between 4 made-up users (Maya `u-maya`, Jordan `u-jordan`, Alex `u-alex`, Sam `u-sam`). `verified` is a static flag in the seed.
**Files:** `seed.ts` (`buildUsers`), `profile-view.tsx` (Demo controls), `store.setActiveUser`.
**Ask first:** `@psu.edu` email OTP or magic link, Microsoft Entra SSO, or NextAuth?
- [ ] Add real sign-up and sign-in, with user profiles created from the account.
- [ ] Set the verified badge from a verified `.edu` email.
- [ ] Hide the persona switcher outside demo mode.

## 3. Payments

**Now:**
- Ledger entries are simulated (`DemoPayment`, with states `DEMO_AUTHORIZED`, `DEMO_RELEASED`, `DEMO_REFUNDED` and `DEMO_DISPUTED`). They're labelled "No real money has been charged" (`PAYMENT_NOTE` and `PAYOUT_NOTE` in `store.ts`).
- Without `STRIPE_SECRET_KEY`, the routes in `src/app/api/stripe/*` return made-up `pi_doro_…` IDs.
- Even with a key, the PaymentIntent is created on the server but never confirmed with a card, so capture can't succeed.
- `accept-dialog.tsx` shows "Stripe card hold authorized" before the API responds, and quietly ignores failures.
- Seeded payments all use `pi_doro_…` with `test_fallback`.
- There are no payouts to helpers (no Stripe Connect).

**Ask first:** Is Stripe Connect needed to pay helpers? Platform fee: keep it at $0?
- [ ] Add a client-side card-entry form (Stripe Elements) that confirms the PaymentIntent using `clientSecret`.
- [ ] Show the success toast only after the hold is confirmed. Show an error and roll back the acceptance if it fails.
- [ ] Add a Stripe webhook route to keep payment state in sync.
- [ ] Replace the `DEMO_*` payment states and the "simulated" labels with real states.
- [ ] Add helper payouts (Stripe Connect), if the user wants them.

## 4. Notifications

**Now:** Notifications are shown inside the app only, stored in the browser. `notifications-view.tsx` says "Notifications are stored in this browser, not sent as push or SMS."
**Ask first:** Web Push only, or also Twilio SMS and Resend email (both optional, behind env vars)?
- [ ] Add Web Push (service worker + VAPID) for strong task matches, offers, accepted tasks and tasks ready to confirm.
- [ ] Respect quiet hours and the `notifyMatches` preference.
- [ ] Keep in-app notifications as the fallback.

## 5. Locations, distance and routing

**Now:** Fixed, approximate campus coordinates ([`src/lib/locations.ts`](src/lib/locations.ts)). Distances are straight lines, travel times are estimates, and the map draws a dashed straight line. There is no GPS.
**Ask first:** Browser geolocation only, or also live helper tracking? Which routing provider (public OSRM, Mapbox, or none)?
- [ ] Use `navigator.geolocation` for "near me" distances, with a consent prompt and a fallback to the user's home location.
- [ ] Draw real walk, bike and drive routes on the Leaflet map. The CATA bus can be approximated.
- [ ] Optional: share the helper's live location while a task is `IN_PROGRESS`, with a geofenced "arrived" prompt.

## 6. Moderation

**Now:** A short regex keyword list ([`src/features/moderation.ts`](src/features/moderation.ts)). It's easy to get around and can block harmless text (e.g. "wine rack", "prescription glasses"). Chat messages aren't checked.
**Already decided:** A smart local classifier that runs in the browser. No API keys.
- [ ] Normalize text: lowercase it, undo leetspeak (`w33d` → `weed`), collapse repeated letters, and use fuzzy matching (Levenshtein distance ≤ 1 on tokens of 5+ characters).
- [ ] Add weighted phrase lists per category: academic dishonesty, substances, weapons, paid rides, paying outside the app, harassment, sharing contact info, and scams or links.
- [ ] Return `{ riskScore: 0–100, level: "allow" | "warn" | "block", reasons, suggestions }`.
- [ ] Show a live warning banner in `post-task.tsx`, and block publishing at the `block` level.
- [ ] In chat (`sendMessage` and `task-detail.tsx`), warn about phone numbers, emails, Venmo/CashApp handles, "pay outside the app" and harassment.
- [ ] Keep `detectProhibitedRequest` backward compatible, since `validateTaskDraft` calls it.
- [ ] Add `src/features/moderation.test.ts` with obvious cases, disguised cases, and cases that must not be blocked.

## 7. Matching and pricing

**Now:** Fixed rules (`matching.ts`, `pricing.ts`, `task-suggestions.ts`). Nothing learns from history.
**Ask first:** Local heuristics only, or an optional LLM endpoint? Should prices learn from completed tasks?
- [ ] Fill in a task from one sentence, e.g. "Bring my charger from Pattee to East Halls by 4pm for $6".
- [ ] Adjust suggested prices per category using accepted and completed rewards.
- [ ] Optional: tune match weights from acceptance history, keeping the explanations honest.

## 8. Reports and trust and safety

**Now:** Reports are stored in the browser. Maya and Jordan act as stand-in moderators who mark reports reviewed in `profile-view.tsx`.
- [ ] Add a real admin or moderator role and a review queue backed by the database (after item 1).
- [ ] Add the ability to suspend users and remove tasks.

## 9. Reviews and reputation

**Now:** Ratings mix reviews from the current session with seeded "prior history" (`types/index.ts` and `seed.ts`).
- [ ] Calculate reputation only from real stored reviews. Keep a neutral starting score for new helpers.

## 10. Proof of completion

**Now:** There are no photos or receipts. Completion relies on the 4-digit handoff code and the requester confirming.
**Ask first:** Local storage only (base64 or IndexedDB), or object storage (Supabase Storage or S3)?
- [ ] Let the helper attach a drop-off photo and a receipt image (for expense reimbursement).
- [ ] Show attachments to the requester before they confirm. Validate file size and type.

## 11. Remove demo wording and controls (do this last)

**Now:** Demo wording appears throughout the app:
- `src/app/page.tsx`: "Open the demo", "Four demo personas", "Payments are simulated", "A hackathon demo…"
- `src/app/not-found.tsx`: "DEMO MODE · No real payments or accounts."
- `profile-view.tsx`: "Demo persona", "Demo controls", "Reset demo data", "Demo payment history", "Demo privacy note"
- `notifications-view.tsx`: the DEMO MODE footer

Tasks:
- [ ] Put the demo wording and controls behind a demo-mode flag (e.g. `NEXT_PUBLIC_DEMO_MODE`), and turn them off in production.
- [ ] Remove "Reset demo data" in production.
- [ ] Rename `DemoStore`, `DemoState`, `DemoPayment`, `DemoProvider` and `useDemo` once a real backend exists.

## Housekeeping

- [ ] Add a README (none exists yet) that covers setup and the `.env` keys (`STRIPE_SECRET_KEY`, `NEXT_PUBLIC_CARTO_API_KEY`, plus any added later), and notes that everything works without them.
