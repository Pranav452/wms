import 'server-only'
import { getPool, sql } from '@/lib/db'
import type { SessionUser } from '@/types/auth'
import type { ActivityEvent, ActivityRow } from '@/types/activity'

// Who downloaded which report and who opened which page — read by the admin
// Activity page. Table created by scripts/create_activity_table.js.
//
// CREATED_AT is server wall-clock time (GETDATE()); ages are measured on the
// same clock so "5 min ago" is right whatever timezone the viewer is in.
const LOG   = 'dbo.TBL_WMS_ACTIVITY_LOG'
const USERS = 'dbo.TBL_WMS_AUTH_USERS'

// Repeat visits to the same page by the same person inside this window count
// once, so the log shows visits rather than every refresh or back-and-forth.
const PAGE_VIEW_WINDOW_MINUTES = 5

export interface ActivityEntry {
  user:       SessionUser
  event:      ActivityEvent
  target:     string
  detail?:    string | null
  ip?:        string | null
  userAgent?: string | null
}

export function requestMeta(headers: Headers): { ip: string | null; userAgent: string | null } {
  return {
    ip:        headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
    userAgent: headers.get('user-agent'),
  }
}

export async function logActivity(e: ActivityEntry): Promise<void> {
  const pool    = await getPool()
  const request = pool.request()
    .input('USER_ID',  sql.Int,           e.user.id)
    .input('USERNAME', sql.VarChar(50),   e.user.username)
    .input('ROLE',     sql.VarChar(20),   e.user.role)
    .input('EVENT',    sql.VarChar(20),   e.event)
    .input('TARGET',   sql.VarChar(100),  e.target.slice(0, 100))
    .input('DETAIL',   sql.NVarChar(400), e.detail ? e.detail.slice(0, 400) : null)
    .input('IP',       sql.VarChar(45),   e.ip ? e.ip.slice(0, 45) : null)
    .input('UA',       sql.NVarChar(300), e.userAgent ? e.userAgent.slice(0, 300) : null)
    .input('WINDOW',   sql.Int,           PAGE_VIEW_WINDOW_MINUTES)

  const insert = `INSERT INTO ${LOG} (USER_ID, USERNAME, ROLE, EVENT, TARGET, DETAIL, IP, USER_AGENT)
                  VALUES (@USER_ID, @USERNAME, @ROLE, @EVENT, @TARGET, @DETAIL, @IP, @UA)`

  await request.query(e.event === 'page_view'
    ? `IF NOT EXISTS (SELECT 1 FROM ${LOG}
                      WHERE USER_ID = @USER_ID AND EVENT = 'page_view' AND TARGET = @TARGET
                        AND CREATED_AT > DATEADD(MINUTE, -@WINDOW, GETDATE()))
         ${insert}`
    : insert)
}

export interface ActivityFilter {
  who:   'clients' | 'all'      // clients = anyone who wasn't an admin at the time
  event: ActivityEvent | 'all'
  days:  number
  limit: number
}

interface LogRow {
  ID:          number
  USERNAME:    string
  NAME:        string | null
  ROLE:        string
  EVENT:       ActivityEvent
  TARGET:      string
  DETAIL:      string | null
  CREATED_AT:  Date
  AGE_SECONDS: number
}

// Newest first.
export async function listActivity(f: ActivityFilter): Promise<ActivityRow[]> {
  const pool   = await getPool()
  const result = await pool.request()
    .input('DAYS',    sql.Int,         f.days)
    .input('LIMIT',   sql.Int,         f.limit)
    .input('EVENT',   sql.VarChar(20), f.event === 'all' ? null : f.event)
    .input('CLIENTS', sql.Bit,         f.who === 'clients')
    .query<LogRow>(`
      SELECT TOP (@LIMIT) L.ID, L.USERNAME, NAME = U.FULLNAME, L.ROLE, L.EVENT, L.TARGET, L.DETAIL,
             L.CREATED_AT, AGE_SECONDS = DATEDIFF(SECOND, L.CREATED_AT, GETDATE())
      FROM ${LOG} L
      LEFT JOIN ${USERS} U ON U.ID = L.USER_ID
      WHERE L.CREATED_AT > DATEADD(DAY, -@DAYS, GETDATE())
        AND (@EVENT IS NULL OR L.EVENT = @EVENT)
        AND (@CLIENTS = 0 OR L.ROLE <> 'admin')
      ORDER BY L.CREATED_AT DESC, L.ID DESC`)
  return result.recordset.map(r => ({
    id:         r.ID,
    username:   r.USERNAME,
    name:       r.NAME,
    role:       r.ROLE,
    event:      r.EVENT,
    target:     r.TARGET,
    detail:     r.DETAIL,
    createdAt:  r.CREATED_AT.toISOString(),
    ageSeconds: r.AGE_SECONDS,
  }))
}
