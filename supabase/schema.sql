-- ============================================================
-- Range Trainer — Supabase Schema
-- Coller dans : Supabase Dashboard > SQL Editor > New Query
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ── user_data ────────────────────────────────────────────────
-- Une ligne par utilisateur, contient tout le state Zustand
create table if not exists public.user_data (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  srs         jsonb not null default '{}'::jsonb,
  config      jsonb not null default '{}'::jsonb,
  sessions    jsonb not null default '[]'::jsonb,
  errors      jsonb not null default '{}'::jsonb,
  heatmap     jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  unique(user_id)
);

-- ── rm_files ─────────────────────────────────────────────────
-- Fichiers .rm importés
create table if not exists public.rm_files (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  content      text not null,
  uploaded_at  timestamptz not null default now()
);

-- ── Row Level Security ────────────────────────────────────────
alter table public.user_data  enable row level security;
alter table public.rm_files   enable row level security;

-- user_data : lecture et écriture uniquement pour son proprio
create policy "user_data_select" on public.user_data
  for select using (auth.uid() = user_id);
create policy "user_data_insert" on public.user_data
  for insert with check (auth.uid() = user_id);
create policy "user_data_update" on public.user_data
  for update using (auth.uid() = user_id);
create policy "user_data_delete" on public.user_data
  for delete using (auth.uid() = user_id);

-- rm_files : idem
create policy "rm_files_select" on public.rm_files
  for select using (auth.uid() = user_id);
create policy "rm_files_insert" on public.rm_files
  for insert with check (auth.uid() = user_id);
create policy "rm_files_update" on public.rm_files
  for update using (auth.uid() = user_id);
create policy "rm_files_delete" on public.rm_files
  for delete using (auth.uid() = user_id);

-- ── Trigger updated_at ───────────────────────────────────────
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger user_data_updated_at
  before update on public.user_data
  for each row execute procedure public.handle_updated_at();
