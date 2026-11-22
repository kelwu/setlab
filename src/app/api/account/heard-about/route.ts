import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import {
  HEARD_ABOUT_OTHER_MAX,
  HEARD_ABOUT_SKIPPED,
  isHeardAboutValue,
} from '@/lib/acquisition';

// Saves the answer to "How did you hear about SetLab?" (or that it was
// skipped). Write-once: a second answer is ignored. Users can't update these
// columns directly (column-level grants on public.users), so the write uses
// the service role after checking the session.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { answer?: unknown; other?: unknown; skipped?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  let heardAbout: string;
  let other: string | null = null;
  if (body.skipped === true) {
    heardAbout = HEARD_ABOUT_SKIPPED;
  } else if (isHeardAboutValue(body.answer)) {
    heardAbout = body.answer;
    if (body.answer === 'other' && typeof body.other === 'string') {
      other = body.other.trim().slice(0, HEARD_ABOUT_OTHER_MAX) || null;
    }
  } else {
    return NextResponse.json({ error: 'Invalid answer' }, { status: 400 });
  }

  const { error } = await createAdminClient()
    .from('users')
    .update({
      heard_about: heardAbout,
      heard_about_other: other,
      heard_about_at: new Date().toISOString(),
    })
    .eq('id', user.id)
    .is('heard_about_at', null);

  if (error) {
    console.warn('[heard-about] save failed', error.message);
    return NextResponse.json({ error: 'Could not save' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
