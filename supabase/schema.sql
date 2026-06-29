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

-- ── preflop_stats ─────────────────────────────────────────────
-- Agrégation des mains suivies (Day/Pos/Hand/Action)
create table if not exists public.preflop_stats (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  day         date not null,
  position    text not null, -- EP, MP, CO, BTN, SB, BB
  spot        text not null default '',
  hand        text not null, -- ex: "AKs", "72o", "JJ"
  action      text not null, -- "Raise", "Fold", "Call"
  count       integer not null default 1,
  net_bb      numeric not null default 0,
  unique(user_id, day, position, spot, hand, action)
);

alter table public.preflop_stats
  add column if not exists spot text not null default '';

alter table public.preflop_stats
  drop constraint if exists preflop_stats_user_id_day_position_hand_action_key;

create unique index if not exists preflop_stats_user_day_pos_spot_hand_action_idx
  on public.preflop_stats (user_id, day, position, spot, hand, action);

alter table public.preflop_stats enable row level security;

create policy "preflop_stats_select" on public.preflop_stats
  for select using (auth.uid() = user_id);
create policy "preflop_stats_insert" on public.preflop_stats
  for insert with check (auth.uid() = user_id);
create policy "preflop_stats_update" on public.preflop_stats
  for update using (auth.uid() = user_id);
create policy "preflop_stats_delete" on public.preflop_stats
  for delete using (auth.uid() = user_id);

-- ── upsert_preflop_stat ───────────────────────────────────────
-- Permet d'incrémenter les stats lors de l'import
create or replace function public.upsert_preflop_stat(
  p_user_id uuid,
  p_day date,
  p_position text,
  p_spot text,
  p_hand text,
  p_action text,
  p_count int,
  p_net_bb numeric
) returns void as $$
begin
  insert into public.preflop_stats (user_id, day, position, spot, hand, action, count, net_bb)
  values (p_user_id, p_day, p_position, p_spot, p_hand, p_action, p_count, p_net_bb)
  on conflict (user_id, day, position, spot, hand, action)
  do update set
    count = public.preflop_stats.count + excluded.count,
    net_bb = public.preflop_stats.net_bb + excluded.net_bb;
end;
$$ language plpgsql;
