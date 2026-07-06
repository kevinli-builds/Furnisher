-- Personal furniture library — one row per user, holding the pieces they own so
-- their furniture follows them across projects/devices (independent of any plan).
-- Run this once in the Supabase SQL editor. Local-only use needs nothing here;
-- the app degrades gracefully when this table is absent.

create table if not exists public.furniture_library (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null default '{"furniture":[],"groups":["General"]}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.furniture_library enable row level security;

-- A user can only see and write their own library row.
create policy "own library: read"   on public.furniture_library for select using (auth.uid() = user_id);
create policy "own library: insert" on public.furniture_library for insert with check (auth.uid() = user_id);
create policy "own library: update" on public.furniture_library for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
