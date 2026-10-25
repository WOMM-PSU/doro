-- Doro cloud sync (optional)
--
-- The app runs fully on localStorage without this. When the two server-only
-- env vars below are set, /api/sync mirrors one JSONB workspace document so a
-- demo can move between devices:
--
--   SUPABASE_URL=https://<project>.supabase.co
--   SUPABASE_SERVICE_ROLE_KEY=...        (server only, never NEXT_PUBLIC_)
--   SUPABASE_WORKSPACE=campus            (optional; defaults to "campus")
--
-- Run this file once in the Supabase SQL editor. All access goes through the
-- server route with the service role; RLS blocks anon/authenticated clients.

create table if not exists public.doro_state (
  workspace text primary key,
  state jsonb not null,
  revision bigint not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.doro_state enable row level security;

-- Supabase grants table privileges to anon/authenticated by default. Remove
-- them so only the service role (which bypasses RLS) can read or write.
revoke all on table public.doro_state from anon, authenticated;

create index if not exists doro_state_updated_at_idx
  on public.doro_state (updated_at desc);

comment on table public.doro_state is
  'Optional Doro marketplace snapshot. One row per shared demo workspace.';
