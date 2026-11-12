import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PLANS } from '@/lib/stripe';
import { ConvertWizard } from '@/components/setdrop/cues/ConvertWizard';

// Per-user authed page — never prerender it.
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Convert Serato → Rekordbox' };

export default async function ConvertPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirect=/convert');

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const [userRow, exportRows] = await Promise.all([
    supabase.from('users').select('subscription_tier, is_beta').eq('id', user.id).single(),
    supabase.from('exports').select('source_type, source_id').eq('user_id', user.id).gte('created_at', monthStart),
  ]);

  const tier = (userRow.data?.subscription_tier ?? 'free') as 'free' | 'pro';
  // Same rule as /api/exports/log: beta testers aren't limited.
  const unlimited = tier === 'pro' || !!userRow.data?.is_beta;
  const used = new Set((exportRows.data ?? []).map(r => `${r.source_type}:${r.source_id}`));
  const limit = PLANS[tier].exportLimit ?? 0;

  return (
    <ConvertWizard
      unlimited={unlimited}
      freeCratesLeft={unlimited ? null : Math.max(0, limit - used.size)}
      alreadyExported={[...used].filter(k => k.startsWith('crate:serato:')).map(k => k.slice('crate:serato:'.length))}
    />
  );
}
