"use client";

import { Fragment, useEffect, useState } from 'react'
import { Ban, Check, Copy, KeyRound, Mail, RefreshCw, RotateCcw, ShieldCheck, ShieldOff, X } from 'lucide-react'
import { PASSWORD_HINT } from '@/lib/auth/constants'
import type { AccountStatus, AdminUserAction, AdminUserRow } from '@/types/auth'

type UsersResponse = { users?: AdminUserRow[]; error?: string }
type ActionResult  = { error?: string }
type Panel         = { id: number; kind: 'reset' | 'email' }

async function fetchUsers(): Promise<UsersResponse> {
  try {
    const res = await fetch('/api/admin/users')
    return await res.json() as UsersResponse
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

// Client-side convenience: a 14-char password with no look-alike characters,
// guaranteed to satisfy the letter+digit rule. The server validates it again.
function generatePassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const picks = new Uint32Array(14)
  crypto.getRandomValues(picks)
  let pw = Array.from(picks, n => alphabet[n % alphabet.length]).join('')
  if (!/\d/.test(pw))       pw = pw.slice(0, -1) + '7'
  if (!/[A-Za-z]/.test(pw)) pw = 'A' + pw.slice(1)
  return pw
}

// DATETIMEs are server wall-clock that arrive tagged as UTC — show them as stored.
function fmt(iso: string | null): string {
  if (!iso) return 'never'
  return new Date(iso).toLocaleString('en-GB', {
    timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

const STATUS: Record<AccountStatus, { label: string; cls: string }> = {
  pending:  { label: 'Pending',  cls: 'bg-amber-100 text-amber-700' },
  active:   { label: 'Active',   cls: 'bg-green-100 text-green-700' },
  disabled: { label: 'Disabled', cls: 'bg-gray-100 text-gray-600' },
}

function Pill({ cls, children }: { cls: string; children: React.ReactNode }) {
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${cls}`}>{children}</span>
}

function ActionButton({ icon: Icon, label, primary, disabled, onClick }: {
  icon:      typeof Check
  label:     string
  primary?:  boolean
  disabled:  boolean
  onClick:   () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        primary
          ? 'bg-red-500 text-white hover:bg-red-600 active:bg-red-700'
          : 'border border-gray-200 text-gray-600 hover:border-red-200 hover:text-red-500'
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  )
}

// Inline "set a temporary password" panel, shown under a row on demand.
function ResetForm({ username, busy, onSubmit, onClose }: {
  username: string
  busy:     boolean
  onSubmit: (password: string) => Promise<ActionResult>
  onClose:  () => void
}) {
  const [pw, setPw]       = useState('')
  const [show, setShow]   = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone]   = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const r = await onSubmit(pw)
    if (r.error) setError(r.error)
    else setDone(true)
  }

  if (done) {
    return (
      <div className="rounded-lg border border-green-100 bg-green-50 p-3 text-xs text-green-700">
        <p className="font-medium">Temporary password set for @{username}.</p>
        <p className="mt-1">Share it securely — they&apos;ll be asked to choose a new one at next sign-in.</p>
        <div className="mt-2 flex items-center gap-2">
          <code className="px-2 py-1 rounded bg-white border border-green-200 text-gray-800 font-mono break-all">{pw}</code>
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(pw).catch(() => {})}
            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-green-200 text-green-700 hover:bg-green-100"
          >
            <Copy className="w-3.5 h-3.5" /> Copy
          </button>
          <button type="button" onClick={onClose} className="ml-auto px-2 py-1 rounded text-gray-500 hover:text-gray-800">Done</button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
      <p className="text-xs font-medium text-gray-600">Set a temporary password for @{username}</p>
      <div className="flex items-center gap-2">
        <input
          type={show ? 'text' : 'password'}
          value={pw}
          onChange={e => setPw(e.target.value)}
          minLength={8}
          maxLength={72}
          autoComplete="new-password"
          placeholder="New temporary password"
          className="flex-1 min-w-0 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-mono text-gray-900 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
        />
        <button type="button" onClick={() => setShow(s => !s)} className="px-2 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:border-red-200 hover:text-red-500">
          {show ? 'Hide' : 'Show'}
        </button>
      </div>
      <p className="text-[11px] text-gray-400">{PASSWORD_HINT}</p>
      {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setPw(generatePassword())} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:border-red-200 hover:text-red-500">
          <RefreshCw className="w-3.5 h-3.5" /> Generate
        </button>
        <button type="submit" disabled={busy || pw.length < 8} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-500 text-white text-xs font-medium hover:bg-red-600 active:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed">
          <KeyRound className="w-3.5 h-3.5" /> {busy ? 'Setting…' : 'Set password'}
        </button>
        <button type="button" onClick={onClose} className="ml-auto px-2.5 py-1.5 rounded-lg text-xs text-gray-500 hover:text-gray-800">Cancel</button>
      </div>
    </form>
  )
}

// Inline email editor. An empty box removes the address.
function EmailForm({ username, current, busy, onSubmit, onClose }: {
  username: string
  current:  string | null
  busy:     boolean
  onSubmit: (email: string) => Promise<ActionResult>
  onClose:  () => void
}) {
  const [email, setEmail] = useState(current ?? '')
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const r = await onSubmit(email.trim())
    if (r.error) setError(r.error)
    else onClose()
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
      <p className="text-xs font-medium text-gray-600">Email for @{username}</p>
      <input
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        maxLength={254}
        autoComplete="off"
        placeholder="name@company.com"
        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
      />
      <p className="text-[11px] text-gray-400">Password reset links are sent here. Leave it empty to remove the address.</p>
      {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
      <div className="flex items-center gap-2">
        <button type="submit" disabled={busy} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-500 text-white text-xs font-medium hover:bg-red-600 active:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed">
          <Mail className="w-3.5 h-3.5" /> {busy ? 'Saving…' : 'Save email'}
        </button>
        <button type="button" onClick={onClose} className="ml-auto px-2.5 py-1.5 rounded-lg text-xs text-gray-500 hover:text-gray-800">Cancel</button>
      </div>
    </form>
  )
}

function UserRow({ u, isSelf, busy, onAction, onEmail, onReset }: {
  u:        AdminUserRow
  isSelf:   boolean
  busy:     boolean
  onAction: (id: number, action: AdminUserAction) => void
  onEmail:  () => void
  onReset?: () => void
}) {
  const act = (action: AdminUserAction) => () => onAction(u.id, action)
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900 truncate">
          {u.name}
          {isSelf && <span className="ml-1.5 text-xs font-normal text-gray-400">(you)</span>}
        </p>
        <p className="text-xs text-gray-400 truncate">
          @{u.username} · {u.status === 'pending' ? `requested ${fmt(u.createdAt)}` : `last sign-in ${fmt(u.lastLoginAt)}`}
        </p>
        <p className={`text-xs truncate ${u.email ? 'text-gray-500' : 'text-amber-600'}`}>
          {u.email ?? 'No email — password reset by email won’t work'}
        </p>
      </div>
      <div className="flex items-center gap-1.5">
        {u.role === 'admin' && <Pill cls="bg-red-50 text-red-600">Admin</Pill>}
        {u.mustChangePw && <Pill cls="bg-amber-100 text-amber-700">Temp password</Pill>}
        <Pill cls={STATUS[u.status].cls}>{STATUS[u.status].label}</Pill>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {!isSelf && u.status === 'pending' && <>
          <ActionButton icon={Check} label="Approve" primary disabled={busy} onClick={act('approve')} />
          <ActionButton icon={X} label="Reject" disabled={busy} onClick={act('reject')} />
        </>}
        {!isSelf && u.status === 'active' && <>
          {u.role === 'admin'
            ? <ActionButton icon={ShieldOff} label="Remove admin" disabled={busy} onClick={act('remove-admin')} />
            : <ActionButton icon={ShieldCheck} label="Make admin" disabled={busy} onClick={act('make-admin')} />}
          <ActionButton icon={Ban} label="Disable" disabled={busy} onClick={act('disable')} />
        </>}
        {!isSelf && u.status === 'disabled' && (
          <ActionButton icon={RotateCcw} label="Enable" disabled={busy} onClick={act('enable')} />
        )}
        <ActionButton icon={Mail} label={u.email ? 'Edit email' : 'Add email'} disabled={busy} onClick={onEmail} />
        {onReset && (
          <ActionButton icon={KeyRound} label="Reset password" disabled={busy} onClick={onReset} />
        )}
      </div>
    </li>
  )
}

// Settings → Users & access (admins only). Data and changes go through
// /api/admin/users, which re-checks the caller's admin role in the DB.
export default function UserAdmin({ currentUserId }: { currentUserId: number }) {
  const [users, setUsers] = useState<AdminUserRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy,  setBusy]  = useState<number | null>(null)   // id of the row being changed
  const [panel, setPanel] = useState<Panel | null>(null)    // row with its reset / email form open

  function apply(r: UsersResponse) {
    if (r.users) setUsers(r.users)
    setError(r.error ?? null)
  }

  useEffect(() => {
    let cancelled = false
    fetchUsers().then(r => { if (!cancelled) apply(r) })
    return () => { cancelled = true }
  }, [])

  // POSTs one change. The inline panels show their own errors, so `inline`
  // keeps those out of the banner at the top.
  async function send(id: number, body: Record<string, unknown>, inline = false): Promise<ActionResult> {
    setBusy(id)
    try {
      const res  = await fetch('/api/admin/users', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id, ...body }),
      })
      const data = await res.json() as UsersResponse
      if (data.users) setUsers(data.users)
      const message = res.ok ? null : (data.error ?? `Request failed (${res.status})`)
      if (!inline) setError(message)
      return message ? { error: message } : {}
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      if (!inline) setError(message)
      return { error: message }
    } finally {
      setBusy(null)
    }
  }

  function onAction(id: number, action: AdminUserAction) {
    if (action === 'reject' && !window.confirm('Reject this request? The sign-up is deleted.')) return
    void send(id, { action })
  }

  const togglePanel = (id: number, kind: Panel['kind']) =>
    setPanel(p => (p?.id === id && p.kind === kind ? null : { id, kind }))

  if (!users) {
    return error
      ? <p role="alert" className="text-xs text-red-500">Couldn&apos;t load users: {error}</p>
      : <p className="text-xs text-gray-400">Loading users…</p>
  }

  const pending  = users.filter(u => u.status === 'pending')
  const accounts = users.filter(u => u.status !== 'pending')

  function renderRow(u: AdminUserRow) {
    const open = panel?.id === u.id ? panel.kind : null
    return (
      <Fragment key={u.id}>
        <UserRow
          u={u}
          isSelf={u.id === currentUserId}
          busy={busy === u.id}
          onAction={onAction}
          onEmail={() => togglePanel(u.id, 'email')}
          onReset={u.status !== 'pending' && u.id !== currentUserId ? () => togglePanel(u.id, 'reset') : undefined}
        />
        {open === 'reset' && (
          <li className="pb-3">
            <ResetForm
              username={u.username}
              busy={busy === u.id}
              onSubmit={pw => send(u.id, { action: 'reset-password', password: pw }, true)}
              onClose={() => setPanel(null)}
            />
          </li>
        )}
        {open === 'email' && (
          <li className="pb-3">
            <EmailForm
              username={u.username}
              current={u.email}
              busy={busy === u.id}
              onSubmit={email => send(u.id, { action: 'set-email', email }, true)}
              onClose={() => setPanel(null)}
            />
          </li>
        )}
      </Fragment>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-gray-400">
          New sign-ups can&apos;t sign in until an admin approves them. Disabling someone cuts off their
          access straight away. Forgotten passwords are reset by email to the address on file, or you can
          set a temporary one they must change at next sign-in.
        </p>
        <button
          type="button"
          onClick={() => fetchUsers().then(apply)}
          className="inline-flex items-center gap-1 text-xs text-red-500 font-medium hover:underline flex-shrink-0"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {error && <p role="alert" className="text-xs text-red-500">{error}</p>}

      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
          Waiting for approval{pending.length > 0 && ` (${pending.length})`}
        </p>
        {pending.length === 0
          ? <p className="text-xs text-gray-400 py-2">No pending requests.</p>
          : <ul className="divide-y divide-gray-50">{pending.map(renderRow)}</ul>}
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Accounts ({accounts.length})</p>
        <ul className="divide-y divide-gray-50">{accounts.map(renderRow)}</ul>
      </div>
    </div>
  )
}
