import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { loopsCreateContact, loopsSendEvent, updateLoopsContact } from '@/lib/email/loops'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // Preserve the user's original destination (e.g. /builder) through OAuth login.
  // Only accept same-origin absolute paths to avoid open-redirect abuse.
  const nextParam = searchParams.get('next')
  const safeNext = nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : null

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const createdAt = data.user?.created_at;
      const isNewUser = createdAt
        ? Date.now() - new Date(createdAt).getTime() < 60_000
        : false;

      if (isNewUser && data.user?.email) {
        loopsCreateContact(data.user.email);  // non-blocking
        loopsSendEvent(data.user.email, 'signup');
        updateLoopsContact(data.user.email, {
          subscriptionTier: 'free',
          signedUpAt: new Date().toISOString().split('T')[0],
        });
      }

      const base = safeNext ?? '/dashboard';
      const dest = isNewUser
        ? `${origin}${base}${base.includes('?') ? '&' : '?'}new_user=1`
        : `${origin}${base}`;
      return NextResponse.redirect(dest);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
