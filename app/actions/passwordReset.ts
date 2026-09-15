'use server'

import { after } from 'next/server'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { hashPassword, validatePassword } from '@/lib/auth/password'
import { consumeResetToken, createResetToken, findResetTarget, RESET_TTL_MINUTES } from '@/lib/auth/resets'
import { sendPasswordResetEmail } from '@/lib/email/passwordReset'
import type { AuthFormState } from '@/types/auth'

// Where the emailed link points. Never taken from the request's Host header in
// production: a forged Host would send someone's reset token to another site.
function appBaseUrl(host: string | null, proto: string | null): string | null {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, '')
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  if (process.env.NODE_ENV !== 'production' && host) return `${proto ?? 'http'}://${host}`
  return null
}

export async function requestPasswordReset(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const identifier = String(formData.get('identifier') ?? '').trim()
  if (!identifier) return { error: 'Enter your username or email address.' }
  if (identifier.length > 254) return { error: 'That is too long to be a username or email address.' }

  const h    = await headers()
  const ip   = h.get('x-forwarded-for')?.split(',')[0]?.trim().slice(0, 45) || null
  const base = appBaseUrl(h.get('x-forwarded-host') ?? h.get('host'), h.get('x-forwarded-proto'))

  try {
    const user  = await findResetTarget(identifier)
    const token = user ? await createResetToken(user.ID, ip) : null
    if (user && token) {
      if (!base) {
        console.error('[auth/reset] no APP_URL — cannot build the reset link')
      } else {
        const url = `${base}/reset-password?token=${encodeURIComponent(token)}`
        // after the response, so how long this takes can't reveal that an account matched
        after(() =>
          sendPasswordResetEmail({ to: user.EMAIL, name: user.FULLNAME, username: user.USERNAME, url, minutes: RESET_TTL_MINUTES })
            .catch(err => console.error('[auth/reset] sending email failed', err)))
      }
    }
  } catch (err) {
    console.error('[auth/reset] request failed', err)
    return { error: 'Could not reach the database. Try again in a moment.' }
  }

  // Same answer whether or not an account matched, so this form can't be used
  // to find out which usernames or email addresses exist.
  return {
    notice: `If that matches an account with an email address on file, a reset link is on its way. It expires in ${RESET_TTL_MINUTES} minutes — check your spam folder if it doesn't arrive.`,
  }
}

export async function resetPasswordWithToken(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const token    = String(formData.get('token') ?? '')
  const password = String(formData.get('password') ?? '')
  const confirm  = String(formData.get('confirm') ?? '')

  if (!token) return { error: 'This reset link is invalid. Request a new one.' }
  const pwError = validatePassword(password)
  if (pwError) return { error: pwError }
  if (password !== confirm) return { error: 'Passwords do not match.' }

  let updated = false
  try {
    updated = await consumeResetToken(token, await hashPassword(password))
  } catch (err) {
    console.error('[auth/reset] consume failed', err)
    return { error: 'Could not update the password. Try again in a moment.' }
  }
  if (!updated) return { error: 'This reset link has expired or was already used. Request a new one.' }

  redirect('/login?reset=1')
}
