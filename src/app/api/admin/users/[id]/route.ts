import { NextRequest, NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/admin';
import { createAdminClient } from '@/lib/supabase/server';

type Action = 'grant_pro' | 'revoke_pro' | 'set_beta' | 'unset_beta' | 'ban' | 'unban';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const { action } = (await req.json().catch(() => ({}))) as { action?: Action };

  const updates: Record<string, unknown> = {};
  switch (action) {
    // comp_pro shields a manually granted tier from Stripe webhook updates.
    case 'grant_pro':  updates.subscription_tier = 'pro'; updates.comp_pro = true; break;
    case 'revoke_pro': updates.subscription_tier = 'free'; updates.comp_pro = false; break;
    case 'set_beta':   updates.is_beta = true; break;
    case 'unset_beta': updates.is_beta = false; break;
    case 'ban':        updates.is_banned = true; break;
    case 'unban':      updates.is_banned = false; break;
    default: return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }

  const db = createAdminClient();
  const { error } = await db.from('users').update(updates).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  if (id === admin.id) {
    return NextResponse.json({ error: 'You cannot delete your own admin account here.' }, { status: 400 });
  }

  // Deletes the auth user; the public.users FK (ON DELETE CASCADE) removes all
  // of their dependent rows (library, setlists, wishlist, track IDs, etc.).
  const db = createAdminClient();
  const { error } = await db.auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
