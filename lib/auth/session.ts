import 'server-only'
import { cache } from 'react'
import { cookies } from 'next/headers'
import type { SessionUser } from '@/types/auth'
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSessionToken, verifySessionToken } from './token'

export async function createSession(user: SessionUser): Promise<void> {
  const store = await cookies()
  store.set(SESSION_COOKIE, await signSessionToken(user), {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',   // plain http on localhost in dev
    sameSite: 'lax',
    path:     '/',
    maxAge:   SESSION_TTL_SECONDS,
  })
}

export async function deleteSession(): Promise<void> {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
}

// Signed-in user for this request, or null. Checks signature + expiry only
// (no DB round-trip); memoised per render pass.
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies()
  return verifySessionToken(store.get(SESSION_COOKIE)?.value)
})
