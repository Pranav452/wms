"use client";

import { useActionState } from 'react'
import { CircleAlert, KeyRound, LoaderCircle } from 'lucide-react'
import { changePassword } from '@/app/actions/auth'
import { PASSWORD_HINT } from '@/lib/auth/constants'
import type { AuthFormState } from '@/types/auth'

function Field({ label, hint, ...input }: { label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-600">{label}</span>
      <input
        required
        type="password"
        {...input}
        className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-red-400 focus:ring-2 focus:ring-red-100"
      />
      {hint && <span className="mt-1 block text-[11px] text-gray-400">{hint}</span>}
    </label>
  )
}

const EMPTY: AuthFormState = {}

export default function ChangePasswordForm({ mustChange }: { mustChange: boolean }) {
  const [state, action, pending] = useActionState(changePassword, EMPTY)

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 sm:p-7">
      <h1 className="text-xl font-bold text-gray-900">
        {mustChange ? 'Set a new password' : 'Change password'}
      </h1>
      <p className="text-sm text-gray-500 mt-1 mb-5">
        {mustChange
          ? 'An administrator reset your password. Choose a new one to continue.'
          : 'Enter your current password and pick a new one.'}
      </p>

      <form action={action} className="space-y-4">
        <Field
          label={mustChange ? 'Temporary password' : 'Current password'}
          name="current"
          autoComplete="current-password"
          autoFocus
        />
        <Field label="New password" name="password" autoComplete="new-password" minLength={8} maxLength={72} hint={PASSWORD_HINT} />
        <Field label="Confirm new password" name="confirm" autoComplete="new-password" minLength={8} maxLength={72} />

        {state.error && (
          <p role="alert" className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600">
            <CircleAlert className="w-4 h-4 flex-shrink-0 mt-px" />
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-red-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-600 active:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
          {pending ? 'Saving…' : 'Save new password'}
        </button>
      </form>
    </div>
  )
}
