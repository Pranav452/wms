import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { hashPassword, validatePassword } from '@/lib/auth/password'
import { adminResetPassword, applyAccountAction, isAccountAction, listAccounts } from '@/lib/auth/users'
import type { SessionUser } from '@/types/auth'

// Admin-only user management behind Settings → Users & access. The caller's
// role is re-read from the DB on every call, never trusted from the cookie.

function denied(me: SessionUser | null) {
  return me
    ? NextResponse.json({ error: 'Admins only' }, { status: 403 })
    : NextResponse.json({ error: 'Not signed in' }, { status: 401 })
}

function failed(err: unknown) {
  const message = err instanceof Error ? err.message : String(err)
  return NextResponse.json({ error: message }, { status: 500 })
}

export async function GET() {
  try {
    const me = await getCurrentUser()
    if (me?.role !== 'admin') return denied(me)
    return NextResponse.json({ users: await listAccounts() })
  } catch (err) {
    return failed(err)
  }
}

// body: { id, action } where action is one of the state-machine actions, or
//       { id, action: 'reset-password', password } to set a temporary password
export async function POST(req: NextRequest) {
  try {
    const me = await getCurrentUser()
    if (me?.role !== 'admin') return denied(me)
    if (!req.headers.get('content-type')?.includes('application/json')) {
      return NextResponse.json({ error: 'Expected JSON' }, { status: 415 })
    }

    const body   = await req.json().catch(() => null) as { id?: unknown; action?: unknown; password?: unknown } | null
    const id     = Number(body?.id)
    const action = body?.action
    if (!Number.isInteger(id)) {
      return NextResponse.json({ error: 'Bad request' }, { status: 400 })
    }
    // keeps at least one admin around, and stops an admin locking themselves
    // out of their own password: self-service changes go through /change-password
    if (id === me.id) {
      return NextResponse.json({ error: "You can't change your own account here — use Change password." }, { status: 400 })
    }

    if (action === 'reset-password') {
      const password = typeof body?.password === 'string' ? body.password : ''
      const pwError  = validatePassword(password)
      if (pwError) return NextResponse.json({ error: pwError }, { status: 400 })

      if (!(await adminResetPassword(id, await hashPassword(password)))) {
        return NextResponse.json(
          { error: 'That account changed in the meantime — the list has been refreshed.', users: await listAccounts() },
          { status: 409 },
        )
      }
      return NextResponse.json({ users: await listAccounts() })
    }

    if (!isAccountAction(action)) {
      return NextResponse.json({ error: 'Bad request' }, { status: 400 })
    }
    if (!(await applyAccountAction(id, action, me.id))) {
      return NextResponse.json(
        { error: 'That account changed in the meantime — the list has been refreshed.', users: await listAccounts() },
        { status: 409 },
      )
    }
    return NextResponse.json({ users: await listAccounts() })
  } catch (err) {
    return failed(err)
  }
}
