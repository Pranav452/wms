"use client";

import Link from 'next/link'
import { useActionState } from 'react'
import { CircleAlert, CircleCheck, LoaderCircle, LogIn, UserPlus } from 'lucide-react'
import { login, signup } from '@/app/actions/auth'
import type { AuthFormState } from '@/types/auth'

function Card({ title, subtitle, footer, children }: {
  title:    string
  subtitle: string
  footer:   React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 sm:p-7">
      <h1 className="text-xl font-bold text-gray-900">{title}</h1>
      <p className="text-sm text-gray-500 mt-1 mb-5">{subtitle}</p>
      {children}
      <p className="text-center text-sm text-gray-500 mt-5">{footer}</p>
    </div>
  )
}

function Field({ label, hint, ...input }: { label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-600">{label}</span>
      <input
        required
        {...input}
        className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-red-400 focus:ring-2 focus:ring-red-100"
      />
      {hint && <span className="mt-1 block text-[11px] text-gray-400">{hint}</span>}
    </label>
  )
}

function FormError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p role="alert" className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600">
      <CircleAlert className="w-4 h-4 flex-shrink-0 mt-px" />
      {message}
    </p>
  )
}

function SubmitButton({ pending, icon: Icon, label, pendingLabel }: {
  pending:      boolean
  icon:         typeof LogIn
  label:        string
  pendingLabel: string
}) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-red-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-600 active:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
      {pending ? pendingLabel : label}
    </button>
  )
}

const EMPTY: AuthFormState = {}

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(login, EMPTY)

  return (
    <Card
      title="Sign in"
      subtitle="Use your Bridge WMS account to open the dashboard."
      footer={<>New to Bridge WMS? <Link href="/signup" className="font-medium text-red-500 hover:underline">Request an account</Link></>}
    >
      <form action={action} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <Field label="Username" name="username" autoComplete="username" autoFocus defaultValue={state.fields?.username} />
        <Field label="Password" name="password" type="password" autoComplete="current-password" />
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
        <p role="status" className="flex items-start gap-2 rounded-lg border border-green-100 bg-green-50 px-3 py-2 text-xs text-green-700">
          <CircleCheck className="w-4 h-4 flex-shrink-0 mt-px" />
          {state.notice}
        </p>
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
          label="Username" name="username" autoComplete="username" minLength={3} maxLength={30}
          defaultValue={state.fields?.username}
          hint="3–30 characters: letters, numbers, dot, dash or underscore"
        />
        <Field
          label="Password" name="password" type="password" autoComplete="new-password" minLength={8} maxLength={72}
          hint="At least 8 characters, with a letter and a number"
        />
        <Field label="Confirm password" name="confirm" type="password" autoComplete="new-password" minLength={8} maxLength={72} />
        <FormError message={state.error} />
        <SubmitButton pending={pending} icon={UserPlus} label="Send request" pendingLabel="Sending…" />
      </form>
    </Card>
  )
}
