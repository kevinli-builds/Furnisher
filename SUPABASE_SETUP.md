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

## 4. Run

```
npm run dev    # http://localhost:3002
```

A "Sign in" button appears top-right once the env vars are set. Sign in, then use
the **☁ My plans** menu to Save / Save as / open / rename / delete plans.
If the env vars are absent, the login UI simply stays hidden.
