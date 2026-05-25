import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { listRmFiles, saveRmFile, deleteRmFile } from '@/lib/db';

// GET /api/rm-files — list files
export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const files = await listRmFiles(supabase);
  return NextResponse.json(files);
}

// POST /api/rm-files — upload a new .rm file
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { name, content } = await req.json();
  if (!name || !content) return NextResponse.json({ error: 'Missing name or content' }, { status: 400 });

  const id = await saveRmFile(supabase, user.id, name, content);
  return NextResponse.json({ id });
}

// DELETE /api/rm-files?id=xxx
export async function DELETE(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  await deleteRmFile(supabase, id);
  return NextResponse.json({ ok: true });
}
