"use client";

import { useEffect, useMemo, useState } from 'react'
import { Download, Eye, RefreshCw, ShieldAlert } from 'lucide-react'
import Header from '@/components/layout/Header'
import { useCurrentUser } from '@/components/layout/UserContext'
import { ErrorState } from '@/components/shared/LoadingState'
import { DOWNLOADS, TRACKED_PAGES } from '@/lib/activity/catalog'
import type { ActivityEvent, ActivityRow } from '@/types/activity'

type Who    = 'clients' | 'all'
type Filter = ActivityEvent | 'all'
type Result = { key: string; rows: ActivityRow[] | null; limit: number; error: string | null }

const PERIODS = [
  { days: 1,  label: '24 hours' },
  { days: 7,  label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
]

const labelFor = (r: ActivityRow) =>
  r.event === 'download'
    ? (DOWNLOADS as Record<string, string>)[r.target] ?? r.target
    : (TRACKED_PAGES as Record<string, string>)[r.target] ?? r.target

function timeAgo(seconds: number): string {
  if (seconds < 60)    return 'just now'
  if (seconds < 3600)  return `${Math.floor(seconds / 60)} min ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`
  const d = Math.floor(seconds / 86400)
  return `${d} day${d === 1 ? '' : 's'} ago`
}

// DATETIMEs are server wall-clock that arrive tagged as UTC — show them as stored.
function fmt(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    timeZone: 'UTC', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3.5 py-2 rounded-full text-xs font-medium transition-colors ${
        active ? 'bg-red-500 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-red-300'
      }`}
    >
      {children}
    </button>
  )
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

// Admin view of who downloaded which report and who opened which page — an
// early sign that a client is looking at stock before a PO arrives.
export default function ActivityPage() {
  const me = useCurrentUser()
  const [who,    setWho]    = useState<Who>('clients')
  const [event,  setEvent]  = useState<Filter>('all')
  const [days,   setDays]   = useState(7)
  const [tick,   setTick]   = useState(0)
  const [result, setResult] = useState<Result | null>(null)

  const key     = `who=${who}&event=${event}&days=${days}`
  const isAdmin = me.role === 'admin'

  useEffect(() => {
    if (!isAdmin) return
    let cancelled = false
    fetch(`/api/admin/activity?${key}`)
      .then(async res => {
        const json = await res.json() as { rows?: ActivityRow[]; limit?: number; error?: string }
        if (!res.ok || !json.rows) throw new Error(json.error || `Request failed (${res.status})`)
        return json
      })
      .then(json => { if (!cancelled) setResult({ key, rows: json.rows ?? [], limit: json.limit ?? 0, error: null }) })
      .catch(e => { if (!cancelled) setResult({ key, rows: null, limit: 0, error: e instanceof Error ? e.message : String(e) }) })
    return () => { cancelled = true }
  }, [key, tick, isAdmin])

  const current = result?.key === key ? result : null
  const rows    = current?.rows ?? null

  // One card per person: when they were last seen and what they last downloaded.
  const people = useMemo(() => {
    const byUser = new Map<string, {
      username: string; name: string | null; role: string
      lastSeen: ActivityRow; lastDownload: ActivityRow | null; downloads: number; visits: number
    }>()
    for (const r of rows ?? []) {                       // rows arrive newest first
      let p = byUser.get(r.username)
      if (!p) {
        p = { username: r.username, name: r.name, role: r.role, lastSeen: r, lastDownload: null, downloads: 0, visits: 0 }
        byUser.set(r.username, p)
      }
      if (r.event === 'download') { p.downloads++; p.lastDownload ??= r } else { p.visits++ }
    }
    return [...byUser.values()]
  }, [rows])

  if (!isAdmin) {
    return (
      <>
        <Header title="Activity" breadcrumb="Activity" />
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex items-center gap-3 text-sm text-gray-600">
          <ShieldAlert className="w-5 h-5 text-red-500 flex-shrink-0" />
          Only admins can see the activity log.
        </div>
      </>
    )
  }

  return (
    <>
      <Header title="Activity" breadcrumb="Activity" />

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Chip active={who === 'clients'} onClick={() => setWho('clients')}>Clients</Chip>
          <Chip active={who === 'all'} onClick={() => setWho('all')}>Everyone</Chip>
          <span className="hidden sm:block w-px h-6 bg-gray-200 mx-1" />
          <Chip active={event === 'all'} onClick={() => setEvent('all')}>All activity</Chip>
          <Chip active={event === 'download'} onClick={() => setEvent('download')}>Downloads</Chip>
          <Chip active={event === 'page_view'} onClick={() => setEvent('page_view')}>Page visits</Chip>
          <span className="hidden sm:block w-px h-6 bg-gray-200 mx-1" />
          {PERIODS.map(p => (
            <Chip key={p.days} active={days === p.days} onClick={() => setDays(p.days)}>Last {p.label}</Chip>
          ))}
          <button
            type="button"
            onClick={() => setTick(t => t + 1)}
            className="ml-auto inline-flex items-center gap-1 text-xs text-red-500 font-medium hover:underline"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>

        {current?.error && <ErrorState message={current.error} />}
        {!current && <p className="text-sm text-gray-400">Loading activity…</p>}

        {rows && (
          <>
            {people.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {people.map(p => (
                  <div key={p.username} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-gray-900 truncate">{p.name ?? p.username}</p>
                      <span className="text-xs text-gray-400 whitespace-nowrap">seen {timeAgo(p.lastSeen.ageSeconds)}</span>
                    </div>
                    <p className="text-xs text-gray-400 truncate">@{p.username}{p.role === 'admin' && ' · Admin'}</p>
                    <p className="mt-2 text-xs text-gray-600">
                      {p.lastDownload
                        ? <>Last download: <b className="text-gray-900">{labelFor(p.lastDownload)}</b> · {timeAgo(p.lastDownload.ageSeconds)}</>
                        : 'No downloads in this period'}
                    </p>
                    <p className="mt-1 text-xs text-gray-400">{plural(p.downloads, 'download')} · {plural(p.visits, 'page visit')}</p>
                  </div>
                ))}
              </div>
            )}

            <section className="bg-white rounded-2xl border border-gray-100 shadow-sm">
              <div className="px-4 sm:px-5 py-3 border-b border-gray-50 flex items-center justify-between gap-3">
                <h2 className="text-sm font-bold text-gray-900">Log</h2>
                <span className="text-xs text-gray-400">
                  {current && rows.length >= current.limit ? `Latest ${current.limit} entries` : plural(rows.length, 'entry').replace('entrys', 'entries')}
                </span>
              </div>
              {rows.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-gray-400">Nothing logged for this filter yet.</p>
              ) : (
                <ul className="divide-y divide-gray-50">
                  {rows.map(r => (
                    <li key={r.id} className="flex items-start gap-3 px-4 sm:px-5 py-3">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        r.event === 'download' ? 'bg-red-50 text-red-500' : 'bg-gray-50 text-gray-400'
                      }`}>
                        {r.event === 'download' ? <Download className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-gray-700">
                          <b className="text-gray-900">{r.name ?? r.username}</b>
                          {r.event === 'download' ? ' downloaded ' : ' opened '}
                          <b className="text-gray-900">{labelFor(r)}</b>
                        </p>
                        <p className="text-xs text-gray-400 truncate">
                          @{r.username}{r.role === 'admin' && ' · Admin'}{r.detail && ` · ${r.detail}`}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs text-gray-600 whitespace-nowrap">{timeAgo(r.ageSeconds)}</p>
                        <p className="text-[11px] text-gray-400 whitespace-nowrap">{fmt(r.createdAt)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </>
  )
}
