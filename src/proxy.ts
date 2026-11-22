import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { FIRST_TOUCH_COOKIE, FIRST_TOUCH_MAX_AGE_S, buildFirstTouch } from '@/lib/acquisition'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session — must be called before any auth checks
  const { data: { user } } = await supabase.auth.getUser()

  // First-touch attribution: on a visitor's first full page view, remember the
  // UTM params, external referrer host, and landing path. Set once, never
  // overwritten; copied onto the user row at signup (see recordFirstTouch).
  if (!user && isFirstPageView(request)) {
    const firstTouch = buildFirstTouch(request.nextUrl, request.headers.get('referer'))
    supabaseResponse.cookies.set(FIRST_TOUCH_COOKIE, JSON.stringify(firstTouch), {
      maxAge: FIRST_TOUCH_MAX_AGE_S,
      httpOnly: true,
      sameSite: 'lax',
      secure: request.nextUrl.protocol === 'https:',
      path: '/',
    })
  }

  return supabaseResponse
}

function isFirstPageView(request: NextRequest): boolean {
  if (request.cookies.has(FIRST_TOUCH_COOKIE)) return false
  if (request.method !== 'GET') return false
  if (request.nextUrl.pathname.startsWith('/api/')) return false
  // Skip client-side navigations and prefetches — only a real document load
  // carries the external Referer.
  if (request.headers.get('rsc') || request.headers.get('next-router-prefetch')) return false
  if (request.headers.get('purpose') === 'prefetch') return false
  return (request.headers.get('accept') ?? '').includes('text/html')
}

export const config = {
  matcher: [
    // Exclude static assets AND the streaming setlist route: middleware in the
    // path buffers the SSE response until it fully completes (~60-90s), so mobile
    // clients time out waiting for the first byte. The route authenticates itself
    // via createClient()/getUser(), so it doesn't need the session-refresh here.
    '/((?!_next/static|_next/image|favicon.ico|api/generate-setlist|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
