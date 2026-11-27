import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, after } from 'next/server'
import { loopsCreateContact, loopsSendEvent, updateLoopsContact } from '@/lib/email/loops'
import { recordFirstTouch } from '@/lib/acquisition-server'
import { FIRST_TOUCH_COOKIE, HEARD_ABOUT_MAX_ACCOUNT_AGE_MS } from '@/lib/acquisition'
import { newAccountDestination } from '@/lib/setdrop/onboarding'

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
        // after() keeps the function alive until these finish, without delaying the redirect.
        // Un-awaited calls can be cut off when a serverless function returns. Run in order so
        // the contact exists before the signup event and properties.
        const email = data.user.email;
        after(async () => {
          await loopsCreateContact(email);
          await loopsSendEvent(email, 'signup');
          await updateLoopsContact(email, {
            subscriptionTier: 'free',
            signedUpAt: new Date().toISOString().split('T')[0],
          });
        });
      }
      // Wider window than isNewUser: email-confirmation links are often clicked
      // minutes after signup. recordFirstTouch only writes when it's still empty.
      const accountAgeMs = createdAt ? Date.now() - new Date(createdAt).getTime() : Infinity;
      if (data.user && accountAgeMs < HEARD_ABOUT_MAX_ACCOUNT_AGE_MS) {
        await recordFirstTouch(data.user.id, cookieStore.get(FIRST_TOUCH_COOKIE)?.value);
      }

      // Upload-first: a brand-new account has no library yet, so the hub pages
      // (dashboard, Plan Set) would only offer demo tracks. Start on import instead.
      const requested = safeNext ?? '/dashboard';
      const base = isNewUser ? newAccountDestination(requested) : requested;
      const dest = isNewUser
        ? `${origin}${base}${base.includes('?') ? '&' : '?'}new_user=1`
        : `${origin}${base}`;
      return NextResponse.redirect(dest);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
