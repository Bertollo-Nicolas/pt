import type { SupabaseClient } from '@supabase/supabase-js';
import type { Session, ErrorEntry, SrsEntry, AppConfig } from './types';

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
