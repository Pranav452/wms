"use client";

import Link from 'next/link'
import { useActionState } from 'react'
import { KeyRound, Mail } from 'lucide-react'
import { requestPasswordReset, resetPasswordWithToken } from '@/app/actions/passwordReset'
import { PASSWORD_HINT } from '@/lib/auth/constants'
import { Card, Field, FormError, FormNotice, SubmitButton } from './AuthUI'
import type { AuthFormState } from '@/types/auth'

const EMPTY: AuthFormState = {}

const backToSignIn = <Link href="/login" className="font-medium text-red-500 hover:underline">Back to sign in</Link>

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, EMPTY)

  if (state.notice) {
    return (
      <Card title="Check your email" subtitle="Open the link in the email to choose a new password." footer={backToSignIn}>
        <FormNotice message={state.notice} />
      </Card>
    )
  }

  return (
    <Card
      title="Forgot password"
      subtitle="Enter your username or email address and we'll email you a link to reset your password."
      footer={backToSignIn}
    >
      <form action={action} className="space-y-4">
        <Field label="Username or email" name="identifier" autoComplete="username" autoFocus maxLength={254} />
        <FormError message={state.error} />
        <SubmitButton pending={pending} icon={Mail} label="Send reset link" pendingLabel="Sending…" />
      </form>
    </Card>
  )
}

export function ResetPasswordForm({ token, username }: { token: string; username: string }) {
  const [state, action, pending] = useActionState(resetPasswordWithToken, EMPTY)

  return (
    <Card
      title="Choose a new password"
      subtitle={`Resetting the password for @${username}.`}
      footer={<>Link not working? <Link href="/forgot-password" className="font-medium text-red-500 hover:underline">Request a new one</Link></>}
    >
      <form action={action} className="space-y-4">
        <input type="hidden" name="token" value={token} />
        {/* lets password managers file the new password under the right account */}
        <input type="text" name="username" defaultValue={username} autoComplete="username" readOnly hidden />
        <Field
          label="New password" name="password" type="password" autoComplete="new-password" autoFocus
          minLength={8} maxLength={72} hint={PASSWORD_HINT}
        />
        <Field label="Confirm new password" name="confirm" type="password" autoComplete="new-password" minLength={8} maxLength={72} />
        <FormError message={state.error} />
        <SubmitButton pending={pending} icon={KeyRound} label="Save new password" pendingLabel="Saving…" />
      </form>
    </Card>
  )
}

export function InvalidResetLink({ reason }: { reason: 'invalid' | 'unavailable' }) {
  return (
    <Card
      title={reason === 'invalid' ? 'Link expired' : 'Something went wrong'}
      subtitle={reason === 'invalid'
        ? 'This password reset link is invalid, has expired, or was already used.'
        : "We couldn't check this reset link right now. Try again in a moment."}
      footer={backToSignIn}
    >
      <Link
        href="/forgot-password"
        className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-red-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-600 active:bg-red-700"
      >
        <Mail className="w-4 h-4" />
        Request a new link
      </Link>
    </Card>
  )
}
