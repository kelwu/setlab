import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { loopsCreateContact, loopsSendEvent, updateLoopsContact } from '@/lib/email/loops';
import { recordFirstTouch } from '@/lib/acquisition-server';
import { FIRST_TOUCH_COOKIE } from '@/lib/acquisition';

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const isNewUser = user.created_at
    ? Date.now() - new Date(user.created_at).getTime() < 120_000
    : false;

  if (isNewUser) {
    loopsCreateContact(user.email); // non-blocking
    loopsSendEvent(user.email, 'signup');
    updateLoopsContact(user.email, {
      subscriptionTier: 'free',
      signedUpAt: new Date().toISOString().split('T')[0],
    });
    const cookieStore = await cookies();
    await recordFirstTouch(user.id, cookieStore.get(FIRST_TOUCH_COOKIE)?.value);
  }

  return NextResponse.json({ ok: true });
}
