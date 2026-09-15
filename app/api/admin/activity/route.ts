import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { listActivity } from '@/lib/activity/log'

const PERIOD_DAYS = [1, 7, 30, 90]
const MAX_ROWS    = 500

// Admin-only read of the activity log. The caller's role is re-read from the
// DB, never trusted from the cookie.
// ?who=clients|all  &event=all|download|page_view  &days=1|7|30|90
export async function GET(req: NextRequest) {
  try {
    const me = await getCurrentUser()
    if (me?.role !== 'admin') {
      return me
        ? NextResponse.json({ error: 'Admins only' }, { status: 403 })
        : NextResponse.json({ error: 'Not signed in' }, { status: 401 })
    }

    const sp      = req.nextUrl.searchParams
    const who     = sp.get('who') === 'all' ? 'all' : 'clients'
    const ev      = sp.get('event')
    const event   = ev === 'download' || ev === 'page_view' ? ev : 'all'
    const asked   = Number(sp.get('days'))
    const days    = PERIOD_DAYS.includes(asked) ? asked : 7

    return NextResponse.json({ rows: await listActivity({ who, event, days, limit: MAX_ROWS }), limit: MAX_ROWS })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
