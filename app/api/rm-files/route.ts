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

// POST /api/rm-files — upload or rename a .rm file
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { name, content, oldName } = await req.json();
  if (!name) return NextResponse.json({ error: 'Missing name' }, { status: 400 });

  if (oldName) {
    // Rename existing file
    const { error } = await supabase
      .from('rm_files')
      .update({ name })
      .eq('user_id', user.id)
      .eq('name', oldName);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } else {
    // Upload new file
    if (!content) return NextResponse.json({ error: 'Missing content' }, { status: 400 });
    const id = await saveRmFile(supabase, user.id, name, content);
    return NextResponse.json({ id });
  }
}

// DELETE /api/rm-files?id=xxx or ?name=xxx
export async function DELETE(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = req.nextUrl.searchParams.get('id');
  const name = req.nextUrl.searchParams.get('name');
  
  if (id) {
    await deleteRmFile(supabase, id);
  } else if (name) {
    const { error } = await supabase
      .from('rm_files')
      .delete()
      .eq('user_id', user.id)
      .eq('name', name);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    return NextResponse.json({ error: 'Missing id or name' }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
