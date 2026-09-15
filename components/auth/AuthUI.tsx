import { CircleAlert, CircleCheck, LoaderCircle, type LucideIcon } from 'lucide-react'

// Building blocks shared by the sign-in, sign-up and password-recovery screens.

export function Card({ title, subtitle, footer, children }: {
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

export function Field({ label, hint, ...input }: { label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
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

export function FormError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p role="alert" className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600">
      <CircleAlert className="w-4 h-4 flex-shrink-0 mt-px" />
      {message}
    </p>
  )
}

export function FormNotice({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p role="status" className="flex items-start gap-2 rounded-lg border border-green-100 bg-green-50 px-3 py-2 text-xs text-green-700">
      <CircleCheck className="w-4 h-4 flex-shrink-0 mt-px" />
      {message}
    </p>
  )
}

export function SubmitButton({ pending, icon: Icon, label, pendingLabel }: {
  pending:      boolean
  icon:         LucideIcon
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
