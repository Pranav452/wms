import 'server-only'
import { createHash, randomBytes } from 'crypto'
import { getPool, sql } from '@/lib/db'

// Password-reset links sent by email. Only a SHA-256 of each token is stored,
// so someone who can read this table still can't use it to reset a password.
// Expiry and throttling run on the DB clock (GETDATE()) so the server's
// wall-clock time is never mixed with the app's UTC.
const RESETS = 'dbo.TBL_WMS_AUTH_PASSWORD_RESETS'
const USERS  = 'dbo.TBL_WMS_AUTH_USERS'

export const RESET_TTL_MINUTES = 30
const MAX_LINKS_PER_HOUR = 3

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

export interface ResetTarget {
  ID:       number
  USERNAME: string
  FULLNAME: string
  EMAIL:    string
}

// An active account with an email on file, matched by email or username
// (usernames can't contain "@", so the two never collide).
export async function findResetTarget(identifier: string): Promise<ResetTarget | undefined> {
  const pool   = await getPool()
  const result = await pool.request()
    .input('IDENT', sql.VarChar(254), identifier)
    .query<ResetTarget>(`
      SELECT ID, USERNAME, FULLNAME, EMAIL FROM ${USERS}
      WHERE (EMAIL = @IDENT OR USERNAME = @IDENT) AND IS_ACTIVE = 1 AND EMAIL IS NOT NULL`)
  return result.recordset[0]
}

// Issues a new single-use token, cancelling any unused ones for the account.
// null when a link went out in the last minute or the hourly limit is reached.
export async function createResetToken(userId: number, ip: string | null): Promise<string | null> {
  const token  = randomBytes(32).toString('base64url')
  const pool   = await getPool()
  const result = await pool.request()
    .input('USER_ID', sql.Int,         userId)
    .input('HASH',    sql.Char(64),    hashToken(token))
    .input('IP',      sql.VarChar(45), ip)
    .input('TTL',     sql.Int,         RESET_TTL_MINUTES)
    .input('MAX',     sql.Int,         MAX_LINKS_PER_HOUR)
    .query<{ ISSUED: number }>(`
      IF (SELECT COUNT(*) FROM ${RESETS} WHERE USER_ID = @USER_ID AND CREATED_AT > DATEADD(HOUR, -1, GETDATE())) >= @MAX
         OR EXISTS (SELECT 1 FROM ${RESETS} WHERE USER_ID = @USER_ID AND CREATED_AT > DATEADD(SECOND, -60, GETDATE()))
        SELECT ISSUED = 0
      ELSE
      BEGIN
        UPDATE ${RESETS} SET EXPIRES_AT = GETDATE()
        WHERE USER_ID = @USER_ID AND USED_AT IS NULL AND EXPIRES_AT > GETDATE();
        INSERT INTO ${RESETS} (USER_ID, TOKEN_HASH, EXPIRES_AT, REQUEST_IP)
        VALUES (@USER_ID, @HASH, DATEADD(MINUTE, @TTL, GETDATE()), @IP);
        SELECT ISSUED = 1
      END`)
  return result.recordset[0]?.ISSUED ? token : null
}

// Username behind a still-usable token, for the reset page; undefined otherwise.
export async function findValidReset(token: string): Promise<{ USERNAME: string } | undefined> {
  const pool   = await getPool()
  const result = await pool.request()
    .input('HASH', sql.Char(64), hashToken(token))
    .query<{ USERNAME: string }>(`
      SELECT U.USERNAME
      FROM ${RESETS} R
      INNER JOIN ${USERS} U ON U.ID = R.USER_ID AND U.IS_ACTIVE = 1
      WHERE R.TOKEN_HASH = @HASH AND R.USED_AT IS NULL AND R.EXPIRES_AT > GETDATE()`)
  return result.recordset[0]
}

// Uses up the token and sets the new password in one transaction. false when
// the token is unknown, already used, expired, or its account is inactive.
export async function consumeResetToken(token: string, passwordHash: string): Promise<boolean> {
  const pool   = await getPool()
  const result = await pool.request()
    .input('HASH', sql.Char(64),    hashToken(token))
    .input('PW',   sql.VarChar(100), passwordHash)
    .query<{ USER_ID: number | null }>(`
      DECLARE @UID INT;
      BEGIN TRY
        BEGIN TRAN;
        UPDATE R SET R.USED_AT = GETDATE(), @UID = R.USER_ID
        FROM ${RESETS} R
        INNER JOIN ${USERS} U ON U.ID = R.USER_ID AND U.IS_ACTIVE = 1
        WHERE R.TOKEN_HASH = @HASH AND R.USED_AT IS NULL AND R.EXPIRES_AT > GETDATE();

        IF @UID IS NOT NULL
        BEGIN
          UPDATE ${USERS}
          SET PASSWORD_HASH = @PW, MUST_CHANGE_PW = 0, PASSWORD_CHANGED_AT = GETDATE()
          WHERE ID = @UID;
          UPDATE ${RESETS} SET EXPIRES_AT = GETDATE()
          WHERE USER_ID = @UID AND USED_AT IS NULL AND EXPIRES_AT > GETDATE();
        END
        COMMIT;
      END TRY
      BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        SET @UID = NULL;
        DECLARE @MSG NVARCHAR(4000);
        SET @MSG = ERROR_MESSAGE();
        RAISERROR(@MSG, 16, 1);
      END CATCH
      SELECT USER_ID = @UID;`)
  return result.recordset[0]?.USER_ID != null
}
