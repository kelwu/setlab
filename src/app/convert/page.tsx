import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ConvertWizard } from '@/components/setdrop/cues/ConvertWizard';

// Per-user authed page — never prerender it.
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Convert Serato → Rekordbox' };

// Free for every signed-in DJ: sign-up is the only gate.
export default async function ConvertPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirect=/convert');
  return <ConvertWizard />;
}
