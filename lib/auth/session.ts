import 'server-only'
import { cache } from 'react'
import { cookies } from 'next/headers'
import type { SessionUser } from '@/types/auth'
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSessionToken, verifySessionToken } from './token'
import { findAccountById } from './users'

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

// The session re-checked against the DB: null when signed out, or when the
// account was disabled or removed after the cookie was issued (the cookie on
// its own stays valid for 7 days). Name and role come back fresh. Use this
// wherever data is served. Throws if the DB is unreachable.
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const session = await getSession()
  if (!session) return null
  const account = await findAccountById(session.id)
  if (!account?.IS_ACTIVE) return null
  return { id: account.ID, username: account.USERNAME, name: account.FULLNAME, role: account.ROLE }
})
