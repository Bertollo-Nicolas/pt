import type { SupabaseClient } from '@supabase/supabase-js';
import type { Session, ErrorEntry, SrsEntry, AppConfig, PreflopStat } from './types';

export interface UserDataRow {
  srs: Record<string, SrsEntry>;
  config: Partial<AppConfig>;
  sessions: Session[];
  errors: Record<string, ErrorEntry>;
  heatmap: Record<string, number>;
}

export interface RmFileRow {
  id: string;
  name: string;
  content: string;
  uploaded_at: string;
}

// ── user_data ─────────────────────────────────────────────────

export async function loadUserData(supabase: SupabaseClient): Promise<UserDataRow | null> {
  const { data, error } = await supabase
    .from('user_data')
    .select('srs, config, sessions, errors, heatmap')
    .single();
  if (error || !data) return null;
  return data as UserDataRow;
}

export async function saveUserData(
  supabase: SupabaseClient,
  userId: string,
  payload: Partial<UserDataRow>,
): Promise<void> {
  await supabase
    .from('user_data')
    .upsert({ user_id: userId, ...payload }, { onConflict: 'user_id' });
}

// ── rm_files ──────────────────────────────────────────────────

export async function listRmFiles(supabase: SupabaseClient): Promise<Pick<RmFileRow, 'id' | 'name' | 'uploaded_at'>[]> {
  const { data } = await supabase
    .from('rm_files')
    .select('id, name, uploaded_at')
    .order('uploaded_at', { ascending: false });
  return (data ?? []) as Pick<RmFileRow, 'id' | 'name' | 'uploaded_at'>[];
}

export async function getRmFile(supabase: SupabaseClient, id: string): Promise<RmFileRow | null> {
  const { data } = await supabase
    .from('rm_files')
    .select('id, name, content, uploaded_at')
    .eq('id', id)
    .single();
  return (data ?? null) as RmFileRow | null;
}

export async function saveRmFile(
  supabase: SupabaseClient,
  userId: string,
  name: string,
  content: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('rm_files')
    .insert({ user_id: userId, name, content })
    .select('id')
    .single();
  return data?.id ?? null;
}

export async function deleteRmFile(supabase: SupabaseClient, id: string): Promise<void> {
  await supabase.from('rm_files').delete().eq('id', id);
}

// ── preflop_stats ─────────────────────────────────────────────

export async function upsertPreflopStats(
  supabase: SupabaseClient,
  userId: string,
  stats: PreflopStat[],
): Promise<void> {
  // Aggregate
  const agg: Record<string, PreflopStat> = {};
  for (const s of stats) {
    const key = `${s.day}__${s.position}__${s.hand}__${s.action}`;
    if (!agg[key]) {
      agg[key] = { ...s };
    } else {
      agg[key].count += s.count;
      agg[key].net_bb += s.net_bb;
    }
  }

  const list = Object.values(agg);
  // Process in chunks of 50 to avoid hitting limits
  for (let i = 0; i < list.length; i += 50) {
    const chunk = list.slice(i, i + 50);
    await Promise.all(
      chunk.map(s =>
        supabase.rpc('upsert_preflop_stat', {
          p_user_id: userId,
          p_day: s.day,
          p_position: s.position,
          p_hand: s.hand,
          p_action: s.action,
          p_count: s.count,
          p_net_bb: s.net_bb,
        }),
      ),
    );
  }
}

export async function loadPreflopStats(supabase: SupabaseClient): Promise<PreflopStat[]> {
  const { data } = await supabase.from('preflop_stats').select('day, position, hand, action, count, net_bb');
  return (data ?? []) as PreflopStat[];
}
