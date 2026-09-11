"use client";

import { useEffect, useState } from 'react'
import { Ban, Check, RefreshCw, RotateCcw, ShieldCheck, ShieldOff, X } from 'lucide-react'
import type { AccountStatus, AdminUserAction, AdminUserRow } from '@/types/auth'

type UsersResponse = { users?: AdminUserRow[]; error?: string }

async function fetchUsers(): Promise<UsersResponse> {
  try {
    const res = await fetch('/api/admin/users')
    return await res.json() as UsersResponse
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
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

function UserRow({ u, isSelf, busy, onAction }: {
  u:        AdminUserRow
  isSelf:   boolean
  busy:     boolean
  onAction: (id: number, action: AdminUserAction) => void
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
      </div>
      <div className="flex items-center gap-1.5">
        {u.role === 'admin' && <Pill cls="bg-red-50 text-red-600">Admin</Pill>}
        <Pill cls={STATUS[u.status].cls}>{STATUS[u.status].label}</Pill>
      </div>
      {!isSelf && (
        <div className="flex flex-wrap items-center gap-1.5">
          {u.status === 'pending' && <>
            <ActionButton icon={Check} label="Approve" primary disabled={busy} onClick={act('approve')} />
            <ActionButton icon={X} label="Reject" disabled={busy} onClick={act('reject')} />
          </>}
          {u.status === 'active' && <>
            {u.role === 'admin'
              ? <ActionButton icon={ShieldOff} label="Remove admin" disabled={busy} onClick={act('remove-admin')} />
              : <ActionButton icon={ShieldCheck} label="Make admin" disabled={busy} onClick={act('make-admin')} />}
            <ActionButton icon={Ban} label="Disable" disabled={busy} onClick={act('disable')} />
          </>}
          {u.status === 'disabled' && (
            <ActionButton icon={RotateCcw} label="Enable" disabled={busy} onClick={act('enable')} />
          )}
        </div>
      )}
    </li>
  )
}

// Settings → Users & access (admins only). Data and changes go through
// /api/admin/users, which re-checks the caller's admin role in the DB.
export default function UserAdmin({ currentUserId }: { currentUserId: number }) {
  const [users, setUsers] = useState<AdminUserRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy,  setBusy]  = useState<number | null>(null)   // id of the row being changed

  function apply(r: UsersResponse) {
    if (r.users) setUsers(r.users)
    setError(r.error ?? null)
  }

  useEffect(() => {
    let cancelled = false
    fetchUsers().then(r => { if (!cancelled) apply(r) })
    return () => { cancelled = true }
  }, [])

  async function onAction(id: number, action: AdminUserAction) {
    if (action === 'reject' && !window.confirm('Reject this request? The sign-up is deleted.')) return
    setBusy(id)
    try {
      const res = await fetch('/api/admin/users', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id, action }),
      })
      apply(await res.json() as UsersResponse)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  if (!users) {
    return error
      ? <p role="alert" className="text-xs text-red-500">Couldn&apos;t load users: {error}</p>
      : <p className="text-xs text-gray-400">Loading users…</p>
  }

  const pending  = users.filter(u => u.status === 'pending')
  const accounts = users.filter(u => u.status !== 'pending')
  const row = (u: AdminUserRow) => (
    <UserRow key={u.id} u={u} isSelf={u.id === currentUserId} busy={busy === u.id} onAction={onAction} />
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-gray-400">
          New sign-ups can&apos;t sign in until an admin approves them. Disabling someone cuts off their access straight away.
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
          : <ul className="divide-y divide-gray-50">{pending.map(row)}</ul>}
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Accounts ({accounts.length})</p>
        <ul className="divide-y divide-gray-50">{accounts.map(row)}</ul>
      </div>
    </div>
  )
}
