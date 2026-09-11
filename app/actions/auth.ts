'use server'

import bcrypt from 'bcryptjs'
import { redirect } from 'next/navigation'
import { getPool, sql } from '@/lib/db'
import { createSession, deleteSession } from '@/lib/auth/session'
import type { AuthFormState } from '@/types/auth'

// Dashboard accounts live in their own table in the manilal DB, separate from
// the ERP's `login` table — see scripts/create_auth_table.js.
const USERS_TABLE   = 'dbo.TBL_WMS_AUTH_USERS'
const BCRYPT_ROUNDS = 12
const USERNAME_RE   = /^[A-Za-z0-9._-]{3,30}$/

interface UserRow {
  ID:            number
  USERNAME:      string
  FULLNAME:      string
  PASSWORD_HASH: string
  ROLE:          string
  IS_ACTIVE:     boolean
}

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

  let user: UserRow | undefined
  try {
    const pool   = await getPool()
    const result = await pool.request()
      .input('USERNAME', sql.VarChar(50), username)
      .query<UserRow>(
        `SELECT ID, USERNAME, FULLNAME, PASSWORD_HASH, ROLE, IS_ACTIVE
         FROM ${USERS_TABLE} WHERE USERNAME = @USERNAME`)
    user = result.recordset[0]
  } catch (err) {
    console.error('[auth/login]', err)
    return { error: 'Could not reach the database. Try again in a moment.', fields }
  }

  const valid = await bcrypt.compare(password, user?.PASSWORD_HASH ?? await getDummyHash())
  if (!user || !valid) return { error: 'Invalid username or password.', fields }
  if (!user.IS_ACTIVE) return { error: 'This account is disabled. Contact the administrator.', fields }

  try {
    const pool = await getPool()
    await pool.request()
      .input('ID', sql.Int, user.ID)
      .query(`UPDATE ${USERS_TABLE} SET LAST_LOGIN_AT = GETDATE() WHERE ID = @ID`)
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
  let id: number
  try {
    const pool   = await getPool()
    const result = await pool.request()
      .input('USERNAME', sql.VarChar(50),   username)
      .input('FULLNAME', sql.NVarChar(100), fullname)
      .input('HASH',     sql.VarChar(100),  hash)
      .query<{ ID: number }>(
        `INSERT INTO ${USERS_TABLE} (USERNAME, FULLNAME, PASSWORD_HASH, LAST_LOGIN_AT)
         OUTPUT INSERTED.ID
         VALUES (@USERNAME, @FULLNAME, @HASH, GETDATE())`)
    id = result.recordset[0].ID
  } catch (err) {
    // 2627 / 2601 = unique-key violation. The DB collation is case-insensitive,
    // so "Ravi" and "ravi" count as the same username.
    const num = (err as { number?: number }).number
    if (num === 2627 || num === 2601) return { error: 'That username is already taken.', fields }
    console.error('[auth/signup]', err)
    return { error: 'Could not create the account. Try again in a moment.', fields }
  }

  await createSession({ id, username, name: fullname, role: 'user' })
  redirect('/overview')
}

export async function logout(): Promise<void> {
  await deleteSession()
  redirect('/login')
}
