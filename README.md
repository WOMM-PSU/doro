# Doro

**Get your stuff done.** A local task marketplace for the small things — a notebook across campus, a charger pickup, twenty minutes of moving help. Post a task, set a fair reward, and match with someone nearby.

Built for University Park, PA. The app runs end to end with **zero API keys**; every integration has a local fallback.

![Doro](src/app/icon.svg)

## Quick start

```bash
npm install
npm run dev        # http://localhost:3000
```

Useful scripts:

```bash
npm run typecheck  # tsc --noEmit
npm test           # Vitest (89 tests)
npm run build      # production build
npm start          # serve the production build
```

The first visit seeds four demo personas, sample tasks, offers and messages into `localStorage`. Switch personas from the avatar menu to see both sides of a task. **Reset demo** restores the sample world.

### The sentence helper and offline mode

The composer's “one sentence is enough” box is read by a hosted model through `/api/compose` (Groq, key never leaves the server). It is a **bonus, not a dependency**: the deterministic parser in `src/features/task-suggestions.ts` is always the floor.

- **Model chain, best reader first.** `qwen/qwen3.8-27b` ($0.80 in / $4.00 out per million) reads this request shape most reliably, then `openai/gpt-oss-120b` ($0.15 / $0.60) as the strong cheaper fallback, then the budget `openai/gpt-oss-20b` ($0.075 / $0.30), then `llama-3.1-8b-instant` (Enterprise, Contact Sales). Override with `GROQ_MODELS`. Groq's catalogue depends on the account, so a model that is missing or unavailable falls through to the next one instead of failing the request. Llama 3.1 8B Instant has been Enterprise-only since August 2026: it still has a docs page, but a Free or Developer key answers `404 model_not_found`, which is why it sits last.
- **Answers are validated, not trusted.** The response is parsed against the app's own rules (`sanitizeModelJson`), and the model's reading is merged with the rule parser, which keeps control of money and duration and corrects a two-place task the cheap model labelled as an errand.
- **Every failure is silent.** No key, offline, timeout, rate limit, bad JSON — the client gets `null` and the rules fill the form. The composer's status line says which one ran.
- **Rate limited.** 20 requests per minute per client, because the route spends the owner's quota.

**PWA.** `src/app/manifest.ts` makes the app installable, and `public/sw.js` caches the shell and static assets so it launches and runs with no network. API calls are never cached — the app renders from `localStorage` — and the service worker is production-only so Fast Refresh keeps working in development. `npm run build && npm start` is how you see it; a dev server will not register it.

## What's implemented

- **Marketplace rules** in `src/features/store.ts`: eligible acceptances, offers, handoff codes, task-scoped chat, cancellation, disputes, reviews and notifications. Illegal transitions are rejected by one table.
- **Explainable matching** across distance, timing, preferences, reward, skills and reliability, with every contribution visible.
- **Fair reward estimates** from category, effort, travel, urgency and completed-task history.
- **Sentence composer**: describe a task in one sentence. A hosted model (Groq) reads it into title, category, places, deadline, duration and reward, and a deterministic parser does the arithmetic. Offline, unconfigured or erroring, the parser alone fills the form.
- **Installable, offline-first PWA**: a web manifest, maskable icons and a service worker that caches the app shell and static assets. Tasks, chat and photos already live in `localStorage`/IndexedDB, so the app keeps working when campus wifi doesn't.
- **Scored local moderation** for posts and chat: normalization, leetspeak, fuzzy matching, weighted categories, explanations and rewrite suggestions. Blocking content cannot be published; chat warns about contact details and off-platform payment.
- **Optional Supabase sync** through `src/lib/repository.ts` and `/api/sync`, with localStorage as the default. Polling keeps a shared demo workspace in sync across devices; the active persona stays device-local.
- **Real delivery routes** from public OSRM for tasks with a pickup and drop-off, drawn on the Leaflet map. A device-locate control is opt-in and never shared.
- **Completion proof**: helper drop-off photos and, when expenses apply, receipt images. Images are compressed into IndexedDB; the task carries metadata only. The requester sees the gallery before confirming.
- **Web Push** with a service worker and VAPID signing on the server. Opt-in per device, and gated by quiet hours and the match preference. In-app notifications remain the fallback.

## Environment variables

Everything below is optional. Copy the values into `.env` (already git-ignored) and restart the server after changes.

| Variable | Purpose |
| --- | --- |
| `GROQ_API_KEY` | Server-only Groq key for the composer's sentence helper. Without it the deterministic parser fills the form. |
| `GROQ_MODELS` | Optional comma-separated model chain. Defaults to `qwen/qwen3.8-27b`, `openai/gpt-oss-120b`, `openai/gpt-oss-20b`, `llama-3.1-8b-instant`. |
| `NEXT_PUBLIC_CARTO_API_KEY` | CARTO Voyager basemap tiles. Without it the map falls back to OpenStreetMap. |
| `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL for cloud sync. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only key used by `/api/sync`. Never expose it with a `NEXT_PUBLIC_` prefix. |
| `SUPABASE_WORKSPACE` | Optional workspace name; defaults to `campus`. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Public key for Web Push subscriptions. |
| `VAPID_PRIVATE_KEY` | Server-only Web Push signing key. |
| `VAPID_SUBJECT` | Optional contact URI, e.g. `mailto:team@example.com`. |
| `STRIPE_SECRET_KEY` | Server-only Stripe key. Enables real PaymentIntents, Connect and Tax. Without it every Stripe route returns deterministic `pi_doro_…` data so the demo still works. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Browser key for the Stripe Payment Element used to authorize card holds. |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for `/api/stripe/webhook`. Required before Stripe sends events. |
| `STRIPE_CONNECT_EMAIL` | Optional contact email for created Express accounts; defaults to `helpers@dorohelp.us`. |
| `APP_ORIGIN` | Optional public origin used in Stripe Connect refresh/return links. Falls back to the request host. |
| `OSRM_BASE_URL` | Optional OSRM server; defaults to `https://router.project-osrm.org`. |
| `NEXT_PUBLIC_DEMO_MODE` | Defaults to demo mode. Set `false` to hide the persona switcher, sample onboarding, demo banners and reset controls. |

Generate a VAPID key pair once:

```bash
npx web-push generate-vapid-keys
```

Put the public key in `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and the private key in `VAPID_PRIVATE_KEY`. The browser only ever sees the public key; `/api/push/send` validates the subscription and signs the push server-side.

### Supabase setup

1. Create a project at [database.new](https://database.new) (or your Supabase dashboard) and wait for the database to finish provisioning.
2. Open **SQL Editor**, paste [`supabase/schema.sql`](supabase/schema.sql) and run it. It creates the `doro_state` table and enables RLS with no client policies, so only the service role can touch it.
3. In **Project Settings → API**, copy:
   - **Project URL** → `SUPABASE_URL`
   - **service_role** secret → `SUPABASE_SERVICE_ROLE_KEY` (never prefix it with `NEXT_PUBLIC_`)
4. Optional: set `SUPABASE_WORKSPACE` (defaults to `campus`) to isolate demo workspaces.
5. Restart the server. Open **Profile → Workspace sync**: it should read **Supabase**, and `/api/sync` should answer `200` instead of `503`.

Without both keys the route returns `503`, the repository stays local, and the app is unaffected. The sync unit is one JSONB workspace document with optimistic last-write-wins; this is deliberate for a zero-auth demo, not a production multi-tenant schema.

### Stripe setup

Doro is a marketplace, so the Stripe wiring has three parts:

| Product | Where | What it does |
| --- | --- | --- |
| **Payments** | [`src/app/api/stripe/payment-intent/route.ts`](src/app/api/stripe/payment-intent/route.ts) | Creates a PaymentIntent with `capture_method: manual` (a card hold) when a helper is assigned. Capture on requester confirmation, cancel or refund on cancellation or disputes. |
| **Connect** | [`src/app/api/stripe/connect/route.ts`](src/app/api/stripe/connect/route.ts) | Profile → **Payouts** creates a Stripe Express account through the Accounts v2 API and redirects to Stripe-hosted onboarding. When payouts are active, new holds use a destination transfer to the helper. |
| **Tax** | [`src/lib/stripe.ts`](src/lib/stripe.ts) | If a billing address is supplied, a Tax Calculation is created and linked to the PaymentIntent. No address means no tax line. |

1. Add your test keys to `.env` (`STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`) and restart.
2. Profile → **Payouts · Stripe Connect** → *Set up payouts* to run Express onboarding. Use Stripe's test values; nothing real is collected.
3. When a helper is assigned, the requester opens the task sheet and clicks **Authorize card hold**. Pay with `4242 4242 4242 4242`, any future expiry and any CVC.
4. Confirm the task to capture the hold. In the Stripe Dashboard the payment moves to captured (and a destination transfer appears when the helper finished onboarding).

Webhooks (optional locally):

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
# copy the printed whsec_… into STRIPE_WEBHOOK_SECRET and restart
```

The handler verifies the signature and logs the events the marketplace needs (`payment_intent.amount_capturable_updated`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, `account.updated`). With Supabase in place, update the task/payment row there instead of only logging.

Stripe Tax needs a **head office address** in *Dashboard → Tax settings* before calculations return anything; without it the route logs a warning and charges no tax. In Connect, destination charges require the helper's transfers capability to be active, so holds stay on the platform account until onboarding finishes.

> The demo stays fully functional with none of these keys: tasks, offers, handoffs, reviews and the ledger use deterministic `pi_doro_…` values.

## Project layout

```
src/app/            App Router pages and API routes
src/components/     UI: shell, discovery, task sheet, composer, profile
src/features/       Store, seed, matching, pricing, moderation, selectors
src/lib/            Persistence, repository, local LLM, attachments, push
supabase/           Optional cloud sync schema
public/sw.js        Web Push service worker
```

Persistence is behind [`src/lib/repository.ts`](src/lib/repository.ts): `LocalRepository` writes the versioned state document to `localStorage`; `SupabaseRepository` mirrors it through `/api/sync`. UI components call store methods and never touch storage directly.

## Tests

```bash
npm test
```

Coverage includes the transition table and store rules, matching, pricing (including learned adjustments), moderation false positives, and the one-sentence parser.

## Known limitations

- **No accounts.** The demo persona switcher is still the identity model. `@psu.edu` sign-in/verification was intentionally skipped.
- **Payments are demo-first.** Ledger states remain `DEMO_*` even with Stripe enabled, because the browser owns the state. Real test-mode holds, captures, refunds and Connect onboarding work, but there is no server ledger or webhook-driven state sync. Keep the demo persona switcher out of any real deployment.
- **No accounts or auth.** Stripe routes trust the client-supplied ids, which is acceptable for a test-mode demo and not for production.
- **Attachments are device-local.** IndexedDB is intentionally not synced; clearing site data removes them.
- **Cloud sync is a shared workspace**, not per-user authorization. Do not point it at real user data.
- **Web Push is per browser subscription.** Without accounts the server does not map subscriptions to users.
- **Campus data is approximate.** Locations, distances and travel times are demo values; OSRM supplies road geometry only.
