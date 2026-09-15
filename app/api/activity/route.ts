import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { isDownloadKey, isTrackedPage } from '@/lib/activity/catalog'
import { logActivity, requestMeta } from '@/lib/activity/log'
import type { ActivityEvent } from '@/types/activity'

// Called from the browser when someone exports a spreadsheet built client-side
// or opens a dashboard page. Who did it comes from the session, never the
// body, and only known report keys / page paths are accepted.
// body: { event: 'download',  target: DownloadKey, detail?: string }
//       { event: 'page_view', target: TrackedPage }
export async function POST(req: NextRequest) {
  try {
    const me = await getCurrentUser()
    if (!me) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
    if (!req.headers.get('content-type')?.includes('application/json')) {
      return NextResponse.json({ error: 'Expected JSON' }, { status: 415 })
    }

    const body   = await req.json().catch(() => null) as { event?: unknown; target?: unknown; detail?: unknown } | null
    const event  = body?.event
    const target = body?.target

    let entry: { event: ActivityEvent; target: string; detail: string | null } | null = null
    if (event === 'download' && isDownloadKey(target)) {
      entry = { event, target, detail: typeof body?.detail === 'string' ? body.detail : null }
    } else if (event === 'page_view' && isTrackedPage(target)) {
      entry = { event, target, detail: null }
    }
    if (!entry) return NextResponse.json({ error: 'Bad request' }, { status: 400 })

    await logActivity({ user: me, ...entry, ...requestMeta(req.headers) })
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
