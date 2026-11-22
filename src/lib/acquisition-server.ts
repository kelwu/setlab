import 'server-only';
import { createAdminClient } from '@/lib/supabase/server';
import { parseFirstTouch } from '@/lib/acquisition';

/**
 * Copies the first-touch cookie onto a new user's row, once. Users can't write
 * these columns themselves (column-level grants on public.users), so this runs
 * with the service role. Never throws: attribution must not break signup, and
 * it no-ops if the columns don't exist yet (migration not applied).
 */
export async function recordFirstTouch(userId: string, cookieValue: string | undefined): Promise<void> {
  const firstTouch = parseFirstTouch(cookieValue);
  if (!firstTouch) return;
  try {
    const { error } = await createAdminClient()
      .from('users')
      .update({ first_touch: firstTouch })
      .eq('id', userId)
      .is('first_touch', null);
    if (error) console.warn('[acquisition] first-touch write failed', error.message);
  } catch (err) {
    console.warn('[acquisition] first-touch write failed', err);
  }
}
