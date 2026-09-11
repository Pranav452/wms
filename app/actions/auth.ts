'use server'

import bcrypt from 'bcryptjs'
import { redirect } from 'next/navigation'
import { createSession, deleteSession } from '@/lib/auth/session'
import { createPendingAccount, findLoginByUsername, stampLastLogin, statusOf, type LoginRecord } from '@/lib/auth/users'
import type { AuthFormState } from '@/types/auth'

const BCRYPT_ROUNDS = 12
const USERNAME_RE   = /^[A-Za-z0-9._-]{3,30}$/

// Compared against when the username doesn't exist, so a miss costs the same
// bcrypt time as a wrong password and response timing can't reveal usernames.
let dummyHash: Promise<string> | null = null
const getDummyHash = () => (dummyHash ??= bcrypt.hash('no-such-user', BCRYPT_ROUNDS))

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

  const valid = await bcrypt.compare(password, user?.PASSWORD_HASH ?? await getDummyHash())
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
  const username = String(formData.get('username') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const confirm  = String(formData.get('confirm') ?? '')
  const fields   = { fullname, username }

  if (fullname.length < 2 || fullname.length > 100)
    return { error: 'Enter your full name (2–100 characters).', fields }
  if (!USERNAME_RE.test(username))
    return { error: 'Username must be 3–30 characters: letters, numbers, dot, dash or underscore.', fields }
  // bcrypt only reads the first 72 bytes
  if (password.length < 8 || new TextEncoder().encode(password).length > 72 || !/[A-Za-z]/.test(password) || !/\d/.test(password))
    return { error: 'Password must be 8–72 characters and include a letter and a number.', fields }
  if (password !== confirm)
    return { error: 'Passwords do not match.', fields }

  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS)
  try {
    await createPendingAccount(username, fullname, hash)
  } catch (err) {
    // 2627 / 2601 = unique-key violation. The DB collation is case-insensitive,
    // so "Ravi" and "ravi" count as the same username.
    const num = (err as { number?: number }).number
    if (num === 2627 || num === 2601) return { error: 'That username is already taken.', fields }
    console.error('[auth/signup]', err)
    return { error: 'Could not create the account. Try again in a moment.', fields }
  }

  // No session: the account can't sign in until an admin approves it.
  return { notice: `Your account "${username}" is waiting for approval. Let your administrator know you've signed up — you can sign in as soon as they approve it.` }
}

export async function logout(): Promise<void> {
  await deleteSession()
  redirect('/login')
}
