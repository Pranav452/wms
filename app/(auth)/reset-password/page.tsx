import type { Metadata } from 'next'
import { InvalidResetLink, ResetPasswordForm } from '@/components/auth/PasswordResetForms'
import { findValidReset } from '@/lib/auth/resets'

// no-referrer: the reset token is in this page's URL, so never pass it on to
// another site through the Referer header.
export const metadata: Metadata = { title: 'Reset password · Bridge WMS', referrer: 'no-referrer' }

export default async function ResetPasswordPage({ searchParams }: {
  searchParams: Promise<{ token?: string | string[] }>
}) {
  const { token } = await searchParams
  const value = typeof token === 'string' ? token : ''

  let username: string | null = null
  let unavailable = false
  if (value) {
    try {
      username = (await findValidReset(value))?.USERNAME ?? null
    } catch (err) {
      console.error('[reset-password page] token lookup failed', err)
      unavailable = true
    }
  }

  if (unavailable) return <InvalidResetLink reason="unavailable" />
  if (!username) return <InvalidResetLink reason="invalid" />
  return <ResetPasswordForm token={value} username={username} />
}
