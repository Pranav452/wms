"use client";

import React, { useState, useEffect, useRef } from 'react'

function todayValue() {
  return new Date().toISOString().slice(0, 10)
}

function toApiDate(isoDate: string) {
  const [y, m, d] = isoDate.split('-')
  return `${d}/${m}/${y}`
}

type ReportType = 'stock' | 'itemstatus'

const REPORTS: { type: ReportType; label: string; desc: string }[] = [
  { type: 'stock',      label: 'Stock Status',     desc: 'Shipment-wise stock balance as on date' },
  { type: 'itemstatus', label: 'Item Status (MRP)', desc: 'Shipment-wise item status with MRP qty' },
]

export default function StockReportDownload() {
  const [date,    setDate]    = useState(todayValue())
  const [loading, setLoading] = useState<ReportType | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [error,   setError]   = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (loading) {
      setElapsed(0)
      timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [loading])

  async function download(type: ReportType) {
    setError(null)
    setLoading(type)
    try {
      const asondate = toApiDate(date)
      const url = `/api/reports/download?type=${type}&asondate=${asondate}`

      const res = await fetch(url)
      if (!res.ok) throw new Error(`API error ${res.status}`)
      const text = await res.text()

      const blob     = new Blob([text], { type: 'application/vnd.ms-excel' })
      const href     = URL.createObjectURL(blob)
      const filename = `${type}-report-${date}.xls`
      const a        = document.createElement('a')
      a.href         = href
      a.download     = filename
      a.click()
      URL.revokeObjectURL(href)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Stock Reports</p>
          <p className="text-xs text-gray-400">Download Excel reports as on date</p>
        </div>

        <div className="flex items-center gap-2 sm:ml-auto flex-wrap">
          <label className="text-xs text-gray-500 font-medium">As on date</label>
          <input
            type="date"
            value={date}
            max={todayValue()}
            onChange={e => setDate(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-red-400"
          />

          {REPORTS.map(r => (
            <button
              key={r.type}
              onClick={() => download(r.type)}
              title={r.desc}
              disabled={loading !== null}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                loading === r.type
                  ? 'bg-red-100 text-red-400 cursor-not-allowed'
                  : loading !== null
                  ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                  : 'bg-red-500 text-white hover:bg-red-600 active:bg-red-700'
              }`}
            >
              {loading === r.type ? (
                <>
                  <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>
                  Preparing… {elapsed}s
                </>
              ) : (
                <>
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3"/>
                  </svg>
                  {r.label}
                </>
              )}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <p className="mt-2 text-xs text-gray-400">
          Fetching report from server — this typically takes 30–60 seconds. Do not close the tab.
        </p>
      )}

      {error && (
        <p className="mt-2 text-xs text-red-500">Error: {error}</p>
      )}
    </div>
  )
}
