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
const USERS  = 'dbo.TBL_WMS_AUTH_USERS'
const RESETS = 'dbo.TBL_WMS_AUTH_PASSWORD_RESETS'

export interface AccountRecord {
  ID:             number
  USERNAME:       string
  FULLNAME:       string
  ROLE:           string
  IS_ACTIVE:      boolean
  APPROVED_AT:    Date | null
  MUST_CHANGE_PW: boolean   // set after an admin reset, cleared when the user picks a new password
}
export interface LoginRecord extends AccountRecord {
  PASSWORD_HASH: string
}

// Never approved = pending sign-up; approved then switched off = disabled.
export function statusOf(a: Pick<AccountRecord, 'IS_ACTIVE' | 'APPROVED_AT'>): AccountStatus {
  return a.IS_ACTIVE ? 'active' : a.APPROVED_AT ? 'disabled' : 'pending'
}

// 2627 / 2601 = unique-key violation (USERNAME or EMAIL). The DB collation is
// case-insensitive, so "Ravi"/"ravi" and "A@x.com"/"a@x.com" clash.
export function isUniqueViolation(err: unknown): boolean {
  const num = (err as { number?: number } | null)?.number
  return num === 2627 || num === 2601
}

const ACCOUNT_COLS = 'ID, USERNAME, FULLNAME, ROLE, IS_ACTIVE, APPROVED_AT, MUST_CHANGE_PW'

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
export async function createPendingAccount(username: string, fullname: string, email: string, passwordHash: string): Promise<void> {
  const pool = await getPool()
  await pool.request()
    .input('USERNAME', sql.VarChar(50),   username)
    .input('FULLNAME', sql.NVarChar(100), fullname)
    .input('EMAIL',    sql.VarChar(254),  email)
    .input('HASH',     sql.VarChar(100),  passwordHash)
    .query(`INSERT INTO ${USERS} (USERNAME, FULLNAME, EMAIL, PASSWORD_HASH, IS_ACTIVE)
            VALUES (@USERNAME, @FULLNAME, @EMAIL, @HASH, 0)`)
}

export async function stampLastLogin(id: number): Promise<void> {
  const pool = await getPool()
  await pool.request()
    .input('ID', sql.Int, id)
    .query(`UPDATE ${USERS} SET LAST_LOGIN_AT = GETDATE() WHERE ID = @ID`)
}

// Any password change also cancels the account's outstanding emailed reset links.
const EXPIRE_RESET_LINKS = `UPDATE ${RESETS} SET EXPIRES_AT = GETDATE()
                            WHERE USER_ID = @ID AND USED_AT IS NULL AND EXPIRES_AT > GETDATE()`

// The user sets their own new password — clears the must-change flag.
export async function setOwnPassword(id: number, passwordHash: string): Promise<void> {
  const pool = await getPool()
  await pool.request()
    .input('ID',   sql.Int,         id)
    .input('HASH', sql.VarChar(100), passwordHash)
    .query(`UPDATE ${USERS}
            SET PASSWORD_HASH = @HASH, MUST_CHANGE_PW = 0, PASSWORD_CHANGED_AT = GETDATE()
            WHERE ID = @ID;
            ${EXPIRE_RESET_LINKS}`)
}

// Admin sets a temporary password: the user must change it at next sign-in.
// Only for established (approved) accounts, never a pending sign-up.
// false when the account is gone or was never approved.
export async function adminResetPassword(id: number, passwordHash: string): Promise<boolean> {
  const pool   = await getPool()
  const result = await pool.request()
    .input('ID',   sql.Int,         id)
    .input('HASH', sql.VarChar(100), passwordHash)
    .query(`UPDATE ${USERS}
            SET PASSWORD_HASH = @HASH, MUST_CHANGE_PW = 1, PASSWORD_CHANGED_AT = GETDATE()
            WHERE ID = @ID AND APPROVED_AT IS NOT NULL;
            IF @@ROWCOUNT > 0 ${EXPIRE_RESET_LINKS}`)
  return result.rowsAffected[0] > 0
}

// null removes the address. false when the account no longer exists.
export async function setAccountEmail(id: number, email: string | null): Promise<boolean> {
  const pool   = await getPool()
  const result = await pool.request()
    .input('ID',    sql.Int,         id)
    .input('EMAIL', sql.VarChar(254), email)
    .query(`UPDATE ${USERS} SET EMAIL = @EMAIL WHERE ID = @ID`)
  return result.rowsAffected[0] > 0
}

interface ListRow extends AccountRecord {
  EMAIL:         string | null
  CREATED_AT:    Date
  LAST_LOGIN_AT: Date | null
  APPROVER:      string | null
}

// Pending requests first, then newest accounts.
export async function listAccounts(): Promise<AdminUserRow[]> {
  const pool   = await getPool()
  const result = await pool.request().query<ListRow>(`
    SELECT U.ID, U.USERNAME, U.FULLNAME, U.EMAIL, U.ROLE, U.IS_ACTIVE, U.APPROVED_AT, U.MUST_CHANGE_PW,
           U.CREATED_AT, U.LAST_LOGIN_AT, APPROVER = A.USERNAME
    FROM ${USERS} U
    LEFT JOIN ${USERS} A ON A.ID = U.APPROVED_BY
    ORDER BY CASE WHEN U.IS_ACTIVE = 0 AND U.APPROVED_AT IS NULL THEN 0 ELSE 1 END, U.CREATED_AT DESC`)
  return result.recordset.map(u => ({
    id:           u.ID,
    username:     u.USERNAME,
    name:         u.FULLNAME,
    email:        u.EMAIL,
    role:         u.ROLE,
    status:       statusOf(u),
    mustChangePw: u.MUST_CHANGE_PW,
    createdAt:    u.CREATED_AT.toISOString(),
    lastLoginAt:  u.LAST_LOGIN_AT?.toISOString() ?? null,
    approvedAt:   u.APPROVED_AT?.toISOString() ?? null,
    approvedBy:   u.APPROVER,
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
