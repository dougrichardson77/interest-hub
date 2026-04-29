create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  active_interest_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.interests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  slug text not null,
  name text not null,
  short_name text not null,
  description text not null default '',
  color text not null default '#0f9fad',
  search_queries jsonb not null default '[]'::jsonb,
  topic_rules jsonb not null default '[]'::jsonb,
  trusted_channels jsonb not null default '[]'::jsonb,
  exclude_keywords jsonb not null default '[]'::jsonb,
  last_refreshed_at timestamptz null,
  last_refresh_status text not null default 'Not refreshed yet',
  last_refresh_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, slug)
);

create table if not exists public.tutorials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  interest_id uuid not null references public.interests (id) on delete cascade,
  video_id text not null,
  title text not null,
  description text not null default '',
  channel_id text not null default '',
  channel_title text not null default '',
  published_at timestamptz null,
  thumbnail_url text not null default '',
  source_queries jsonb not null default '[]'::jsonb,
  query_tags jsonb not null default '[]'::jsonb,
  duration_seconds integer not null default 0,
  duration_label text not null default '0:00',
  view_count bigint not null default 0,
  like_count bigint not null default 0,
  embeddable boolean not null default true,
  tags jsonb not null default '[]'::jsonb,
  trusted_channel boolean not null default false,
  url text not null default '',
  embed_url text not null default '',
  fetched_at timestamptz null,
  saved boolean not null default false,
  watched boolean not null default false,
  notes text not null default '',
  relevance_score integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, interest_id, video_id)
);

create index if not exists interests_user_created_idx
  on public.interests (user_id, created_at);

create index if not exists tutorials_user_interest_published_idx
  on public.tutorials (user_id, interest_id, published_at desc);

create index if not exists tutorials_user_video_idx
  on public.tutorials (user_id, video_id);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists interests_set_updated_at on public.interests;
create trigger interests_set_updated_at
before update on public.interests
for each row
execute function public.set_updated_at();

drop trigger if exists tutorials_set_updated_at on public.tutorials;
create trigger tutorials_set_updated_at
before update on public.tutorials
for each row
execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.interests enable row level security;
alter table public.tutorials enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
using (auth.uid() = user_id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
with check (auth.uid() = user_id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "interests_select_own" on public.interests;
create policy "interests_select_own"
on public.interests
for select
using (auth.uid() = user_id);

drop policy if exists "interests_insert_own" on public.interests;
create policy "interests_insert_own"
on public.interests
for insert
with check (auth.uid() = user_id);

drop policy if exists "interests_update_own" on public.interests;
create policy "interests_update_own"
on public.interests
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "interests_delete_own" on public.interests;
create policy "interests_delete_own"
on public.interests
for delete
using (auth.uid() = user_id);

drop policy if exists "tutorials_select_own" on public.tutorials;
create policy "tutorials_select_own"
on public.tutorials
for select
using (auth.uid() = user_id);

drop policy if exists "tutorials_insert_own" on public.tutorials;
create policy "tutorials_insert_own"
on public.tutorials
for insert
with check (auth.uid() = user_id);

drop policy if exists "tutorials_update_own" on public.tutorials;
create policy "tutorials_update_own"
on public.tutorials
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "tutorials_delete_own" on public.tutorials;
create policy "tutorials_delete_own"
on public.tutorials
for delete
using (auth.uid() = user_id);
