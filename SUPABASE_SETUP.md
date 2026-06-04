# Supabase setup (optional login + cloud save)

The app works fully locally with no account. Configuring Supabase adds Google
sign-in and per-user cloud-saved plans. Everything stays client-side — the app
is still a static site; Supabase's row-level security protects each user's rows.

Project: `qkwdjvoeganggqntzeya` → `https://qkwdjvoeganggqntzeya.supabase.co`

## 1. Environment variables

Create `.env.local` (and add the same two vars in Vercel → Project → Settings →
Environment Variables):

```
NEXT_PUBLIC_SUPABASE_URL=https://qkwdjvoeganggqntzeya.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your anon public key>
```

Find the anon key in Supabase → **Project Settings → API → Project API keys →
`anon` `public`**. (Do **not** use the `service_role` key — never put that in a
browser app.)

## 2. Database table + row-level security

Supabase → **SQL Editor** → run:

```sql
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  name text not null default 'Untitled plan',
  data jsonb not null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.projects enable row level security;

create policy "read own plans"   on public.projects for select using (auth.uid() = user_id);
create policy "insert own plans" on public.projects for insert with check (auth.uid() = user_id);
create policy "update own plans" on public.projects for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own plans" on public.projects for delete using (auth.uid() = user_id);
```

(`user_id` defaults to `auth.uid()`, so inserts don't even need to send it.)

## 3. Google sign-in

1. **Google Cloud Console** → create an OAuth 2.0 **Web** client (or reuse one).
   Add this Authorized redirect URI:
   `https://qkwdjvoeganggqntzeya.supabase.co/auth/v1/callback`
2. **Supabase → Authentication → Providers → Google** → enable, paste the Google
   client ID + secret, save.
3. **Supabase → Authentication → URL Configuration**:
   - **Site URL**: your production origin (e.g. `https://furnisher.vercel.app`)
   - **Redirect URLs**: add `http://localhost:3002` (dev) and your Vercel origin.

## 4. Collaboration (sharing)

Run this once to enable share-links + collaborator sync. It adds a members
table, a share token, the policies that let collaborators read/edit a shared
plan, and the `join_project` redemption function:

```sql
-- share token on each project
alter table public.projects add column if not exists share_token uuid unique;

-- who can access a project besides its owner
create table if not exists public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
alter table public.project_members enable row level security;

create policy "see relevant memberships" on public.project_members for select
  using (user_id = auth.uid()
         or exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));

-- membership check (security definer avoids RLS recursion)
create or replace function public.is_project_member(p uuid)
  returns boolean language sql security definer set search_path = public as $$
  select exists (select 1 from public.project_members where project_id = p and user_id = auth.uid());
$$;

-- collaborators can read + edit shared plans (these OR with the owner policies)
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
```

Then enable **Realtime** so collaborators' saves stream live:

```sql
alter publication supabase_realtime add table public.projects;
```

**Recommended hardening** — collaborators can edit a shared plan's contents, but
should not be able to seize ownership or change its share token. This trigger
locks `user_id` + `share_token` to the owner:

```sql
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
```

(or Supabase → **Database → Replication** → add `projects` to `supabase_realtime`.)

How it works in the app: open a cloud plan → it **auto-saves** (debounced) for
durability. Live editing is **real-time**: each client broadcasts per-object
edits over a Supabase Realtime channel (`collab:<projectId>`) and shows
collaborator **cursors** via Presence — so two people moving different pieces
see each other instantly without clobbering. Click the **🔗** next to a plan you
own to copy a share link (`…/?join=<token>`); anyone who opens it while signed
in joins.

Realtime **broadcast + presence work out of the box** (no extra SQL). The
channel name embeds the project's UUID (only members can discover it via the
RLS-protected table). To lock the channel down further, enable **Realtime
Authorization** (private channels) and add an RLS policy on `realtime.messages`
restricting `collab:<projectId>` to that project's members — optional hardening.

## 5. Run

```
npm run dev    # http://localhost:3002
```

A "Sign in" button appears top-right once the env vars are set. Sign in, then use
the **☁ My plans** menu to Save / Save as / open / rename / delete / share plans.
If the env vars are absent, the login UI simply stays hidden.
