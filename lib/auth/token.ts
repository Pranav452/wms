import { SignJWT, jwtVerify } from 'jose'
import type { SessionUser } from '@/types/auth'

// Kept free of next/headers and server-only so proxy.ts can import it.

export const SESSION_COOKIE      = 'wms_session'
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7   // 7 days

function key(): Uint8Array {
  const secret = process.env.SESSION_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET must be set (32+ characters) to sign session cookies')
  }
  return new TextEncoder().encode(secret)
}

export function signSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(key())
}

// null for a missing, tampered or expired token
export async function verifySessionToken(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null
  const secret = key()   // outside the try: a missing secret must fail loudly, not look like "signed out"
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] })
    const { id, username, name, role } = payload
    if (typeof id !== 'number' || typeof username !== 'string') return null
    return {
      id,
      username,
      name: typeof name === 'string' ? name : username,
      role: typeof role === 'string' ? role : 'user',
    }
  } catch {
    return null
  }
}
