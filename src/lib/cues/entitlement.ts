import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Whether the user's SetLab exports may carry hot cues: Pro subscribers and
 * beta accounts. (Converting a Serato library in /convert is free for
 * everyone — this only gates cues inside set/crate exports.)
 */
export async function userHasCueExport(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('users')
    .select('subscription_tier, is_beta')
    .eq('id', userId)
    .maybeSingle();
  const row = data as { subscription_tier?: string | null; is_beta?: boolean | null } | null;
  return row?.subscription_tier === 'pro' || row?.is_beta === true;
}
