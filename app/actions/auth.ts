'use server'

import { redirect } from 'next/navigation'
import { createSession, deleteSession, getSession } from '@/lib/auth/session'
import { normalizeEmail } from '@/lib/auth/email'
import { hashPassword, verifyPassword, validatePassword } from '@/lib/auth/password'
import {
  createPendingAccount, findLoginByUsername, isUniqueViolation, setOwnPassword, stampLastLogin, statusOf,
  type LoginRecord,
} from '@/lib/auth/users'
import type { AuthFormState } from '@/types/auth'

const USERNAME_RE = /^[A-Za-z0-9._-]{3,30}$/

// Compared against when the username doesn't exist, so a miss costs the same
// bcrypt time as a wrong password and response timing can't reveal usernames.
let dummyHash: Promise<string> | null = null
const getDummyHash = () => (dummyHash ??= hashPassword('no-such-user'))

// Only same-app relative paths — never an open redirect to another host.
function safeNext(value: FormDataEntryValue | null): string {
  const s = typeof value === 'string' ? value : ''
  return s.startsWith('/') && !s.startsWith('//') && !s.startsWith('/\\') ? s : '/overview'
}

export async function login(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const username = String(formData.get('username') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const fields   = { username }
  if (!username || !password) return { error: 'Enter your username and password.', fields }

  let user: LoginRecord | undefined
  try {
    user = await findLoginByUsername(username)
  } catch (err) {
    console.error('[auth/login]', err)
    return { error: 'Could not reach the database. Try again in a moment.', fields }
  }

  const valid = await verifyPassword(password, user?.PASSWORD_HASH ?? await getDummyHash())
  if (!user || !valid) return { error: 'Invalid username or password.', fields }

  // only reached with the right password, so these don't reveal which usernames exist
  const status = statusOf(user)
  if (status === 'pending')  return { error: 'Your account is waiting for an admin to approve it.', fields }
  if (status === 'disabled') return { error: 'This account has been disabled. Contact an administrator.', fields }

  try {
    await stampLastLogin(user.ID)
  } catch (err) {
    console.error('[auth/login] last-login stamp failed', err)   // never blocks sign-in
  }

  await createSession({ id: user.ID, username: user.USERNAME, name: user.FULLNAME, role: user.ROLE })
  redirect(safeNext(formData.get('next')))
}

export async function signup(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const fullname = String(formData.get('fullname') ?? '').trim().replace(/\s+/g, ' ')
  const rawEmail = String(formData.get('email') ?? '').trim()
  const username = String(formData.get('username') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const confirm  = String(formData.get('confirm') ?? '')
  const fields   = { fullname, username, email: rawEmail }

  if (fullname.length < 2 || fullname.length > 100)
    return { error: 'Enter your full name (2–100 characters).', fields }
  const email = normalizeEmail(rawEmail)
  if (!email)
    return { error: 'Enter a valid email address — password reset links are sent there.', fields }
  if (!USERNAME_RE.test(username))
    return { error: 'Username must be 3–30 characters: letters, numbers, dot, dash or underscore.', fields }
  const pwError = validatePassword(password)
  if (pwError)
    return { error: pwError, fields }
  if (password !== confirm)
    return { error: 'Passwords do not match.', fields }

  const hash = await hashPassword(password)
  try {
    await createPendingAccount(username, fullname, email, hash)
  } catch (err) {
    if (isUniqueViolation(err)) {
      return /EMAIL/i.test(err instanceof Error ? err.message : '')
        ? { error: 'That email address is already registered.', fields }
        : { error: 'That username is already taken.', fields }
    }
    console.error('[auth/signup]', err)
    return { error: 'Could not create the account. Try again in a moment.', fields }
  }

  // No session: the account can't sign in until an admin approves it.
  return { notice: `Your account "${username}" is waiting for approval. Let your administrator know you've signed up — you can sign in as soon as they approve it.` }
}

// Used both for a forced change after an admin reset and for a voluntary
// self-service change. Requires the current password either way, so an
// unattended signed-in session can't be used to lock the owner out.
export async function changePassword(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const session = await getSession()
  if (!session) redirect('/login')

  const current = String(formData.get('current') ?? '')
  const next    = String(formData.get('password') ?? '')
  const confirm = String(formData.get('confirm') ?? '')

  if (!current) return { error: 'Enter your current password.' }
  const pwError = validatePassword(next)
  if (pwError) return { error: pwError }
  if (next !== confirm) return { error: 'New passwords do not match.' }

  let user: LoginRecord | undefined
  try {
    user = await findLoginByUsername(session.username)
  } catch (err) {
    console.error('[auth/changePassword]', err)
    return { error: 'Could not reach the database. Try again in a moment.' }
  }
  if (!user || !user.IS_ACTIVE) redirect('/login')   // account removed or disabled since sign-in

  if (!(await verifyPassword(current, user.PASSWORD_HASH)))
    return { error: 'Your current password is incorrect.' }
  if (await verifyPassword(next, user.PASSWORD_HASH))
    return { error: 'Choose a password different from your current one.' }

  const hash = await hashPassword(next)
  try {
    await setOwnPassword(user.ID, hash)
  } catch (err) {
    console.error('[auth/changePassword] update failed', err)
    return { error: 'Could not update the password. Try again in a moment.' }
  }

  redirect('/overview')
}

export async function logout(): Promise<void> {
  await deleteSession()
  redirect('/login')
}
