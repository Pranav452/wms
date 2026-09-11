import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth/token'

// Reachable without signing in. Every other page and every /api route needs a
// valid session cookie. Route handlers re-check the session themselves too —
// this is the fast outer gate, not the only one.
const PUBLIC_PATHS = ['/login', '/signup']

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl
  const session  = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)
  const isPublic = PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))

  if (isPublic) {
    // already signed in — skip the sign-in screens
    return session ? NextResponse.redirect(new URL('/overview', req.nextUrl)) : NextResponse.next()
  }
  if (session) return NextResponse.next()

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }
  const loginUrl = new URL('/login', req.nextUrl)
  if (pathname !== '/') loginUrl.searchParams.set('next', pathname + search)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  // everything except Next's build assets and files served from /public
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
}
