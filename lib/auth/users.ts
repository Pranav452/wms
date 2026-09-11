import 'server-only'
import { getPool, sql } from '@/lib/db'
import type { AccountStatus, AdminUserAction, AdminUserRow } from '@/types/auth'

// Dashboard accounts: in the manilal DB, but separate from the ERP's own
// `login` table (created by scripts/create_auth_table.js). All SQL against it
// lives here.
//
// DATETIME columns hold server wall-clock time (GETDATE()); mssql hands them
// back as if they were UTC, so format them with timeZone: 'UTC' to show them
// as stored.
const USERS = 'dbo.TBL_WMS_AUTH_USERS'

export interface AccountRecord {
  ID:          number
  USERNAME:    string
  FULLNAME:    string
  ROLE:        string
  IS_ACTIVE:   boolean
  APPROVED_AT: Date | null
}
export interface LoginRecord extends AccountRecord {
  PASSWORD_HASH: string
}

// Never approved = pending sign-up; approved then switched off = disabled.
export function statusOf(a: Pick<AccountRecord, 'IS_ACTIVE' | 'APPROVED_AT'>): AccountStatus {
  return a.IS_ACTIVE ? 'active' : a.APPROVED_AT ? 'disabled' : 'pending'
}

const ACCOUNT_COLS = 'ID, USERNAME, FULLNAME, ROLE, IS_ACTIVE, APPROVED_AT'

export async function findLoginByUsername(username: string): Promise<LoginRecord | undefined> {
  const pool   = await getPool()
  const result = await pool.request()
    .input('USERNAME', sql.VarChar(50), username)
    .query<LoginRecord>(`SELECT ${ACCOUNT_COLS}, PASSWORD_HASH FROM ${USERS} WHERE USERNAME = @USERNAME`)
  return result.recordset[0]
}

export async function findAccountById(id: number): Promise<AccountRecord | undefined> {
  const pool   = await getPool()
  const result = await pool.request()
    .input('ID', sql.Int, id)
    .query<AccountRecord>(`SELECT ${ACCOUNT_COLS} FROM ${USERS} WHERE ID = @ID`)
  return result.recordset[0]
}

// New sign-ups start inactive and unapproved, i.e. pending.
export async function createPendingAccount(username: string, fullname: string, passwordHash: string): Promise<void> {
  const pool = await getPool()
  await pool.request()
    .input('USERNAME', sql.VarChar(50),   username)
    .input('FULLNAME', sql.NVarChar(100), fullname)
    .input('HASH',     sql.VarChar(100),  passwordHash)
    .query(`INSERT INTO ${USERS} (USERNAME, FULLNAME, PASSWORD_HASH, IS_ACTIVE) VALUES (@USERNAME, @FULLNAME, @HASH, 0)`)
}

export async function stampLastLogin(id: number): Promise<void> {
  const pool = await getPool()
  await pool.request()
    .input('ID', sql.Int, id)
    .query(`UPDATE ${USERS} SET LAST_LOGIN_AT = GETDATE() WHERE ID = @ID`)
}

interface ListRow extends AccountRecord {
  CREATED_AT:    Date
  LAST_LOGIN_AT: Date | null
  APPROVER:      string | null
}

// Pending requests first, then newest accounts.
export async function listAccounts(): Promise<AdminUserRow[]> {
  const pool   = await getPool()
  const result = await pool.request().query<ListRow>(`
    SELECT U.ID, U.USERNAME, U.FULLNAME, U.ROLE, U.IS_ACTIVE, U.APPROVED_AT,
           U.CREATED_AT, U.LAST_LOGIN_AT, APPROVER = A.USERNAME
    FROM ${USERS} U
    LEFT JOIN ${USERS} A ON A.ID = U.APPROVED_BY
    ORDER BY CASE WHEN U.IS_ACTIVE = 0 AND U.APPROVED_AT IS NULL THEN 0 ELSE 1 END, U.CREATED_AT DESC`)
  return result.recordset.map(u => ({
    id:          u.ID,
    username:    u.USERNAME,
    name:        u.FULLNAME,
    role:        u.ROLE,
    status:      statusOf(u),
    createdAt:   u.CREATED_AT.toISOString(),
    lastLoginAt: u.LAST_LOGIN_AT?.toISOString() ?? null,
    approvedAt:  u.APPROVED_AT?.toISOString() ?? null,
    approvedBy:  u.APPROVER,
  }))
}

// Each action only applies from the state it makes sense in, so a stale
// screen can't e.g. "reject" someone another admin has just approved.
const ACTION_SQL: Record<AdminUserAction, string> = {
  'approve':      `UPDATE ${USERS} SET IS_ACTIVE = 1, APPROVED_AT = GETDATE(), APPROVED_BY = @BY WHERE ID = @ID AND IS_ACTIVE = 0 AND APPROVED_AT IS NULL`,
  // deletes the request; approved accounts are disabled instead, never deleted
  'reject':       `DELETE FROM ${USERS} WHERE ID = @ID AND IS_ACTIVE = 0 AND APPROVED_AT IS NULL`,
  'enable':       `UPDATE ${USERS} SET IS_ACTIVE = 1 WHERE ID = @ID AND IS_ACTIVE = 0 AND APPROVED_AT IS NOT NULL`,
  'disable':      `UPDATE ${USERS} SET IS_ACTIVE = 0, APPROVED_AT = ISNULL(APPROVED_AT, GETDATE()) WHERE ID = @ID AND IS_ACTIVE = 1`,
  'make-admin':   `UPDATE ${USERS} SET ROLE = 'admin' WHERE ID = @ID AND IS_ACTIVE = 1 AND ROLE <> 'admin'`,
  'remove-admin': `UPDATE ${USERS} SET ROLE = 'user' WHERE ID = @ID AND ROLE = 'admin'`,
}

export function isAccountAction(value: unknown): value is AdminUserAction {
  return typeof value === 'string' && Object.hasOwn(ACTION_SQL, value)
}

// false when the account is gone or no longer in a state the action applies to
export async function applyAccountAction(id: number, action: AdminUserAction, byId: number): Promise<boolean> {
  const pool   = await getPool()
  const result = await pool.request()
    .input('ID', sql.Int, id)
    .input('BY', sql.Int, byId)
    .query(ACTION_SQL[action])
  return result.rowsAffected[0] > 0
}
