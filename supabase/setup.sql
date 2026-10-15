-- ════════════════════════════════════════════════════════════════
--  Engagement Live Album — Supabase setup
--  Paste this whole file into Supabase → SQL Editor → Run.
--  Safe to run again (idempotent).
--  ⚠ Change the host PIN on the line marked  >>> CHANGE ME <<<
-- ════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto with schema extensions;

-- ── 1. Photos table ───────────────────────────────────────────
create table if not exists public.photos (
  id          uuid primary key,
  path        text not null unique check (path ~ '^full/[0-9a-f-]{36}\.jpg$'),
  thumb_path  text not null unique check (thumb_path ~ '^thumb/[0-9a-f-]{36}\.jpg$'),
  guest_name  text check (char_length(guest_name) <= 40),
  caption     text check (char_length(caption) <= 140),
  width       int  check (width  between 1 and 8000),
  height      int  check (height between 1 and 8000),
  filter      text check (char_length(filter) <= 20),
  created_at  timestamptz not null default now()
);
create index if not exists photos_created_at_idx on public.photos (created_at desc);

alter table public.photos enable row level security;

-- Guests (anonymous) can read everything and add photos — but never edit or delete.
drop policy if exists "Anyone can view photos" on public.photos;
create policy "Anyone can view photos" on public.photos
  for select to anon, authenticated using (true);

drop policy if exists "Guests can add photos" on public.photos;
create policy "Guests can add photos" on public.photos
  for insert to anon, authenticated
  with check (
    path = 'full/' || id::text || '.jpg'
    and thumb_path = 'thumb/' || id::text || '.jpg'
  );

-- Server sets the timestamp (clients can't back-date or future-date photos)
create or replace function public.photos_set_created_at() returns trigger
language plpgsql as $$ begin new.created_at := now(); return new; end $$;
drop trigger if exists photos_created_at on public.photos;
create trigger photos_created_at before insert on public.photos
  for each row execute function public.photos_set_created_at();

-- ── 2. Realtime (live updates) ────────────────────────────────
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'photos'
  ) then
    alter publication supabase_realtime add table public.photos;
  end if;
end $$;

-- ── 3. Storage bucket (public read, JPEG only, 6 MB max) ──────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 6291456, array['image/jpeg'])
on conflict (id) do update
  set public = true, file_size_limit = 6291456, allowed_mime_types = array['image/jpeg'];

drop policy if exists "Guests can upload photos" on storage.objects;
create policy "Guests can upload photos" on storage.objects
  for insert to anon, authenticated
  with check (
    bucket_id = 'photos'
    and name ~ '^(full|thumb)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
  );
-- No update/delete policies → guests can never overwrite or remove files.

-- ── 4. Host tools (PIN-protected moderation) ──────────────────
create table if not exists public.app_secrets (
  key   text primary key,
  value text not null
);
alter table public.app_secrets enable row level security;  -- no policies = unreadable by guests
revoke all on public.app_secrets from anon, authenticated;

insert into public.app_secrets (key, value)
values ('admin_pin', extensions.crypt('change-this-pin', extensions.gen_salt('bf')))   -- >>> CHANGE ME <<<
on conflict (key) do update set value = excluded.value;

create or replace function public.admin_check_pin(p_pin text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare h text;
begin
  select value into h from public.app_secrets where key = 'admin_pin';
  if h is null or p_pin is null then return false; end if;
  perform pg_sleep(0.4);  -- slows down brute-force guessing
  return h = crypt(p_pin, h);
end $$;

create or replace function public.admin_delete_photo(p_id uuid, p_pin text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.admin_check_pin(p_pin) then
    raise exception 'Invalid host PIN' using errcode = '28000';
  end if;
  delete from public.photos where id = p_id;
  return found;
end $$;

revoke all on function public.admin_check_pin(text) from public;
revoke all on function public.admin_delete_photo(uuid, text) from public;
grant execute on function public.admin_check_pin(text) to anon, authenticated;
grant execute on function public.admin_delete_photo(uuid, text) to anon, authenticated;

-- Done ✔  Copy your Project URL and anon/publishable key into config.js
