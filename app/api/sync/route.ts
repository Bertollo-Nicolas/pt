import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { loadUserData, saveUserData } from '@/lib/db';

// GET /api/sync — load user data
export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const data = await loadUserData(supabase);
  return NextResponse.json(data ?? {});
}

// POST /api/sync — save user data (full or partial)
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  await saveUserData(supabase, user.id, body);
  return NextResponse.json({ ok: true });
}
