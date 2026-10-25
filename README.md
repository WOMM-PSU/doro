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
npm test           # Vitest (57 tests)
npm run build      # production build
npm start          # serve the production build
```

The first visit seeds four demo personas, sample tasks, offers and messages into `localStorage`. Switch personas from the avatar menu to see both sides of a task. **Reset demo** restores the sample world.

## What's implemented

- **Marketplace rules** in `src/features/store.ts`: eligible acceptances, offers, handoff codes, task-scoped chat, cancellation, disputes, reviews and notifications. Illegal transitions are rejected by one table.
- **Explainable matching** across distance, timing, preferences, reward, skills and reliability, with every contribution visible.
- **Fair reward estimates** from category, effort, travel, urgency and completed-task history.
- **On-device task composer**: describe a task in one sentence. Chrome's built-in Prompt API is used when available; otherwise a deterministic parser fills category, places, deadline, duration and reward. No text leaves the browser.
- **Scored local moderation** for posts and chat: normalization, leetspeak, fuzzy matching, weighted categories, explanations and rewrite suggestions. Blocking content cannot be published; chat warns about contact details and off-platform payment.
- **Optional Supabase sync** through `src/lib/repository.ts` and `/api/sync`, with localStorage as the default. Polling keeps a shared demo workspace in sync across devices; the active persona stays device-local.
- **Real delivery routes** from public OSRM for tasks with a pickup and drop-off, drawn on the Leaflet map. A device-locate control is opt-in and never shared.
- **Completion proof**: helper drop-off photos and, when expenses apply, receipt images. Images are compressed into IndexedDB; the task carries metadata only. The requester sees the gallery before confirming.
- **Web Push** with a service worker and VAPID signing on the server. Opt-in per device, and gated by quiet hours and the match preference. In-app notifications remain the fallback.

## Environment variables

Everything below is optional. Copy the values into `.env` (already git-ignored) and restart the server after changes.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_CARTO_API_KEY` | CARTO Voyager basemap tiles. Without it the map falls back to OpenStreetMap. |
| `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL for cloud sync. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only key used by `/api/sync`. Never expose it with a `NEXT_PUBLIC_` prefix. |
| `SUPABASE_WORKSPACE` | Optional workspace name; defaults to `campus`. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Public key for Web Push subscriptions. |
| `VAPID_PRIVATE_KEY` | Server-only Web Push signing key. |
| `VAPID_SUBJECT` | Optional contact URI, e.g. `mailto:team@example.com`. |
| `STRIPE_SECRET_KEY` | Enables live Stripe PaymentIntent calls. Without it the routes return deterministic `pi_doro_…` test IDs. |
| `OSRM_BASE_URL` | Optional OSRM server; defaults to `https://router.project-osrm.org`. |
| `NEXT_PUBLIC_DEMO_MODE` | Defaults to demo mode. Set `false` to hide the persona switcher, sample onboarding, demo banners and reset controls. |

Generate a VAPID key pair once:

```bash
npx web-push generate-vapid-keys
```

Put the public key in `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and the private key in `VAPID_PRIVATE_KEY`. The browser only ever sees the public key; `/api/push/send` validates the subscription and signs the push server-side.

### Supabase setup

1. Create a project and open the SQL editor.
2. Run [`supabase/schema.sql`](supabase/schema.sql). It creates the `doro_state` table and blocks client access with RLS; only the server route uses the service role.
3. Add the two server keys above and restart. Profile → **Workspace sync** should read “Supabase”.

Without both keys the route returns `503`, the repository stays local, and the app is unaffected. The sync unit is one JSONB workspace document with optimistic last-write-wins; this is deliberate for a zero-auth demo, not a production multi-tenant schema.

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
- **Payments are simulated.** Ledger states are `DEMO_*`; Stripe routes can create and confirm intents, but there is no Connect payout flow.
- **Attachments are device-local.** IndexedDB is intentionally not synced; clearing site data removes them.
- **Cloud sync is a shared workspace**, not per-user authorization. Do not point it at real user data.
- **Web Push is per browser subscription.** Without accounts the server does not map subscriptions to users.
- **Campus data is approximate.** Locations, distances and travel times are demo values; OSRM supplies road geometry only.
