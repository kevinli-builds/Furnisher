-- Furnisher — projects + collaboration schema (canonical).
--
-- This is the source of truth for the cloud-save + share/collaboration backend.
-- Previously these blocks lived ONLY inside SUPABASE_SETUP.md, so applying the
-- `supabase/` folder gave you furniture_library RLS but NOT projects/members RLS
-- (F2). Run this whole file once in the Supabase SQL editor (idempotent).
--
-- Safe to re-run: every statement uses if-not-exists / create-or-replace, except
-- the policies (Postgres has no "create policy if not exists"), which are dropped
-- first.

-- ── projects table + own-row RLS ──────────────────────────────────────────────
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  name text not null default 'Untitled plan',
  data jsonb not null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  share_token uuid unique
);

alter table public.projects enable row level security;

drop policy if exists "read own plans"   on public.projects;
drop policy if exists "insert own plans" on public.projects;
drop policy if exists "update own plans" on public.projects;
drop policy if exists "delete own plans" on public.projects;
create policy "read own plans"   on public.projects for select using (auth.uid() = user_id);
create policy "insert own plans" on public.projects for insert with check (auth.uid() = user_id);
create policy "update own plans" on public.projects for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own plans" on public.projects for delete using (auth.uid() = user_id);

-- ── membership table (who can access a project besides its owner) ─────────────
create table if not exists public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
alter table public.project_members enable row level security;

-- Members can see their own membership; the owner can see all of a project's.
-- Note: there is deliberately NO client insert/delete policy — membership changes
-- go only through the SECURITY DEFINER functions below (join_project /
-- revoke_sharing), so the client can never forge or orphan a membership.
drop policy if exists "see relevant memberships" on public.project_members;
create policy "see relevant memberships" on public.project_members for select
  using (user_id = auth.uid()
         or exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));

-- membership check (security definer avoids RLS recursion)
create or replace function public.is_project_member(p uuid)
  returns boolean language sql security definer set search_path = public as $$
  select exists (select 1 from public.project_members where project_id = p and user_id = auth.uid());
$$;

-- collaborators can read + edit shared plans (these OR with the owner policies)
drop policy if exists "members read"   on public.projects;
drop policy if exists "members update" on public.projects;
create policy "members read"   on public.projects for select using (public.is_project_member(id));
create policy "members update" on public.projects for update using (public.is_project_member(id)) with check (public.is_project_member(id));

-- redeem a share token → become a member; returns the project id
create or replace function public.join_project(p_token uuid)
  returns uuid language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  select id into pid from public.projects where share_token = p_token;
  if pid is null then return null; end if;
  insert into public.project_members (project_id, user_id) values (pid, auth.uid()) on conflict do nothing;
  return pid;
end; $$;
grant execute on function public.join_project(uuid) to authenticated;

-- revoke sharing → clear the token AND remove everyone who already joined, so
-- turning off the link actually cuts off access (F1). Owner-checked + atomic;
-- clearing the token alone left existing project_members with read+edit forever.
create or replace function public.revoke_sharing(p_project_id uuid)
  returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.projects where id = p_project_id and user_id = auth.uid()
  ) then
    raise exception 'Only the owner can revoke sharing';
  end if;
  update public.projects set share_token = null where id = p_project_id;
  delete from public.project_members where project_id = p_project_id;
end; $$;
grant execute on function public.revoke_sharing(uuid) to authenticated;

-- ── owner-column guard ────────────────────────────────────────────────────────
-- Collaborators can edit a shared plan's contents but must not seize ownership or
-- change its share token.
create or replace function public.guard_project_owner_cols()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() <> old.user_id
     and (new.user_id <> old.user_id or new.share_token is distinct from old.share_token) then
    raise exception 'Only the owner can change ownership or the share link';
  end if;
  return new;
end; $$;

drop trigger if exists guard_project_owner_cols on public.projects;
create trigger guard_project_owner_cols before update on public.projects
  for each row execute function public.guard_project_owner_cols();

-- ── realtime (collaborators' saves stream live) ───────────────────────────────
-- Adding an already-present table errors, so guard it.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'projects'
  ) then
    alter publication supabase_realtime add table public.projects;
  end if;
end $$;
