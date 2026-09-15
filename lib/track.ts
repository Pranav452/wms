import { isTrackedPage, type DownloadKey } from '@/lib/activity/catalog'

// Browser-side reports to the activity log (POST /api/activity). Fire-and-forget:
// they never throw and never hold up the export or the page — a lost log line
// is better than a lost download. Who did it is taken from the session on the
// server, not from here.
function send(body: object) {
  try {
    fetch('/api/activity', {
      method:    'POST',
      headers:   { 'Content-Type': 'application/json' },
      body:      JSON.stringify(body),
      keepalive: true,
    }).catch(() => {})
  } catch {
    /* logging must never break the caller */
  }
}

export function trackDownload(target: DownloadKey, detail?: string) {
  send({ event: 'download', target, detail })
}

export function trackPageView(pathname: string) {
  if (isTrackedPage(pathname)) send({ event: 'page_view', target: pathname })
}
