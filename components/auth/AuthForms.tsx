"use client";

import Link from 'next/link'
import { useActionState } from 'react'
import { LogIn, UserPlus } from 'lucide-react'
import { login, signup } from '@/app/actions/auth'
import { PASSWORD_HINT } from '@/lib/auth/constants'
import { Card, Field, FormError, FormNotice, SubmitButton } from './AuthUI'
import type { AuthFormState } from '@/types/auth'

const EMPTY: AuthFormState = {}

export function LoginForm({ next, notice }: { next: string; notice?: string }) {
  const [state, action, pending] = useActionState(login, EMPTY)

  return (
    <Card
      title="Sign in"
      subtitle="Use your Bridge WMS account to open the dashboard."
      footer={<>New to Bridge WMS? <Link href="/signup" className="font-medium text-red-500 hover:underline">Request an account</Link></>}
    >
      <form action={action} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        {!state.error && <FormNotice message={notice} />}
        <Field label="Username" name="username" autoComplete="username" autoFocus defaultValue={state.fields?.username} />
        <div>
          <Field label="Password" name="password" type="password" autoComplete="current-password" />
          <div className="mt-1.5 text-right">
            <Link href="/forgot-password" className="text-xs font-medium text-red-500 hover:underline">Forgot password?</Link>
          </div>
        </div>
        <FormError message={state.error} />
        <SubmitButton pending={pending} icon={LogIn} label="Sign in" pendingLabel="Signing in…" />
      </form>
    </Card>
  )
}

export function SignupForm() {
  const [state, action, pending] = useActionState(signup, EMPTY)

  if (state.notice) {
    return (
      <Card
        title="Request sent"
        subtitle="An admin needs to approve your account first."
        footer={<Link href="/login" className="font-medium text-red-500 hover:underline">Back to sign in</Link>}
      >
        <FormNotice message={state.notice} />
      </Card>
    )
  }

  return (
    <Card
      title="Request an account"
      subtitle="An admin approves new accounts before they can sign in."
      footer={<>Already have an account? <Link href="/login" className="font-medium text-red-500 hover:underline">Sign in</Link></>}
    >
      <form action={action} className="space-y-4">
        <Field label="Full name" name="fullname" autoComplete="name" autoFocus maxLength={100} defaultValue={state.fields?.fullname} />
        <Field
          label="Email" name="email" type="email" autoComplete="email" maxLength={254}
          defaultValue={state.fields?.email}
          hint="Password reset links are sent here"
        />
        <Field
          label="Username" name="username" autoComplete="username" minLength={3} maxLength={30}
          defaultValue={state.fields?.username}
          hint="3–30 characters: letters, numbers, dot, dash or underscore"
        />
        <Field
          label="Password" name="password" type="password" autoComplete="new-password" minLength={8} maxLength={72}
          hint={PASSWORD_HINT}
        />
        <Field label="Confirm password" name="confirm" type="password" autoComplete="new-password" minLength={8} maxLength={72} />
        <FormError message={state.error} />
        <SubmitButton pending={pending} icon={UserPlus} label="Send request" pendingLabel="Sending…" />
      </form>
    </Card>
  )
}
