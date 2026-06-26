"use client";

import React, { Suspense, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, Search, Filter, Download, RefreshCw, Sparkles } from 'lucide-react'
import Header from '@/components/layout/Header'
import { BinRack, AiInsightCard } from '@/components/racks/ui'
import { RACKS, locationCode, type Rack } from '@/lib/racks'
import { bayStats } from '@/lib/occupancy'
import { formatNumber } from '@/lib/utils'

const ITEM_NAMES = [
  'Plastic Crate (Large)', 'Carton Box (M)', 'Steel Tote', 'Folding Bin',
  'Shrink Film Roll', 'Stretch Wrap', 'Label Roll', 'Pallet Collar',
]

interface BinItem {
  sku: string
  name: string
  bin: string
  qty: number
  volume: number
  turnover: number
}

function buildItems(rack: Rack): BinItem[] {
  const items: BinItem[] = []
  let i = 0
  for (let level = rack.levels; level >= 1; level--) {
    for (let col = 0; col < rack.cols; col++) {
      items.push({
        sku: `BX-${100 + (i % 900)}`,
        name: ITEM_NAMES[i % ITEM_NAMES.length],
        bin: locationCode(rack.name, level, col),
        qty: 20 + ((i * 37) % 200),
        volume: 10 + ((i * 13) % 80),
        turnover: 20 + ((i * 7) % 200),
      })
      i++
    }
  }
  return items
}

const PAGE_SIZE = 25

function RackBinDetailInner() {
  const router = useRouter()
  const sp = useSearchParams()
  const rackName = sp.get('rack') || RACKS[0].name
  const rack = useMemo<Rack>(() => RACKS.find(r => r.name === rackName) || RACKS[0], [rackName])

  const allItems = useMemo(() => buildItems(rack), [rack])
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return allItems
    return allItems.filter(it =>
      it.name.toLowerCase().includes(q) || it.sku.toLowerCase().includes(q) || it.bin.toLowerCase().includes(q),
    )
  }, [allItems, query])

  const pageItems = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)
  const bins = bayStats(rack).slice(0, 9).map(b => ({ code: b.label, pct: b.pct }))

  function exportCsv() {
    const rows = [['SKU', 'Item Name', 'BIN', 'Quantity', 'Volume%', 'Turnover']]
    for (const it of filtered) rows.push([it.sku, it.name, it.bin, String(it.qty), String(it.volume), String(it.turnover)])
    const url = URL.createObjectURL(new Blob([rows.map(r => r.join(',')).join('\n')], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `rack-${rack.name}-bins.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <Header title="Rack/Bin Detail" breadcrumb="Rack / Bin Detail" />

      <div className="flex items-center justify-between gap-3 mb-4">
        <button onClick={() => router.push('/racks/map')} className="flex items-center gap-1 text-sm text-gray-500 hover:text-red-500 transition-colors">
          <ChevronLeft className="w-4 h-4" /> Back to Warehouse Map
        </button>
        <label className="flex items-center gap-2 bg-white border border-gray-100 shadow-sm rounded-xl px-3 py-2 text-sm">
          <span className="text-gray-400 text-xs">Rack</span>
          <select
            value={rack.name}
            onChange={e => { setPage(0); router.replace(`/racks/detail?rack=${e.target.value}`) }}
            className="bg-transparent text-gray-700 outline-none cursor-pointer"
          >
            {RACKS.map(r => <option key={r.name} value={r.name}>{r.name}</option>)}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-4 items-start">
        {/* Table card */}
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4 min-w-0">
          <p className="text-sm text-gray-600 mb-3">
            Showing <b className="text-gray-900">{Math.min(PAGE_SIZE, pageItems.length)}</b> of{' '}
            <b className="text-gray-900">{formatNumber(filtered.length)}</b> items. Last synced 5 minutes ago.
          </p>

          <div className="flex flex-wrap items-center gap-2 mb-3">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={query}
                onChange={e => { setQuery(e.target.value); setPage(0) }}
                placeholder="Search by item name, SKU, or bin location…"
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-red-400"
              />
            </div>
            <button className="flex items-center gap-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg px-3 py-2 hover:border-gray-300">
              <Filter className="w-4 h-4" /> Filters
            </button>
            <button onClick={exportCsv} className="flex items-center gap-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg px-3 py-2 hover:border-gray-300">
              <Download className="w-4 h-4" /> Export CSV
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-100">
                  <th className="py-2 pr-3 font-medium">SKU</th>
                  <th className="py-2 pr-3 font-medium">Item Name</th>
                  <th className="py-2 pr-3 font-medium">BIN</th>
                  <th className="py-2 pr-3 font-medium text-right">Quantity</th>
                  <th className="py-2 pr-3 font-medium text-right">Volume</th>
                  <th className="py-2 font-medium text-right">Turnover</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((it, idx) => (
                  <tr key={`${it.bin}-${idx}`} className="border-b border-gray-50 hover:bg-gray-50/60">
                    <td className="py-2.5 pr-3 font-medium text-gray-900">{it.sku}</td>
                    <td className="py-2.5 pr-3 text-gray-600">{it.name}</td>
                    <td className="py-2.5 pr-3 font-mono text-gray-500">{it.bin}</td>
                    <td className="py-2.5 pr-3 text-right text-gray-700">{it.qty} pcs</td>
                    <td className="py-2.5 pr-3 text-right text-gray-700">{it.volume}%</td>
                    <td className="py-2.5 text-right text-gray-700">{it.turnover}</td>
                  </tr>
                ))}
                {pageItems.length === 0 && (
                  <tr><td colSpan={6} className="py-8 text-center text-gray-400">No matching items.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-3 text-sm">
            <div className="flex items-center gap-3">
              <span className="text-gray-400">Rows per page: {PAGE_SIZE}</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-2 py-1 rounded border border-gray-200 text-gray-500 disabled:opacity-40 hover:border-gray-300"
                >Prev</button>
                <span className="text-gray-500 px-1">{page + 1} / {Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))}</span>
                <button
                  onClick={() => setPage(p => (p + 1) * PAGE_SIZE < filtered.length ? p + 1 : p)}
                  disabled={(page + 1) * PAGE_SIZE >= filtered.length}
                  className="px-2 py-1 rounded border border-gray-200 text-gray-500 disabled:opacity-40 hover:border-gray-300"
                >Next</button>
              </div>
            </div>
            <span className="flex items-center gap-1.5 text-red-500"><RefreshCw className="w-3.5 h-3.5" /> Synced</span>
          </div>
        </div>

        {/* Right rail: bin rack + AI suggestion */}
        <div className="space-y-4">
          <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Rack {rack.name} bins</h3>
            <BinRack bins={bins} />
          </div>

          <AiInsightCard
            title="AI Suggestion for Rearrangement"
            action={
              <button className="bg-white border border-gray-200 text-gray-700 text-sm rounded-lg px-3 py-1.5 hover:border-red-300 hover:text-red-500 transition-colors">
                Generate Now
              </button>
            }
          >
            <p>Move low-turnover SKUs to a zone with free space to balance occupancy.</p>
            <p>Group high-turnover items near the ground shelf to speed up picking.</p>
          </AiInsightCard>
        </div>
      </div>
    </>
  )
}

export default function RackBinDetailPage() {
  return (
    <Suspense fallback={<Header title="Rack/Bin Detail" breadcrumb="Rack / Bin Detail" />}>
      <RackBinDetailInner />
    </Suspense>
  )
}
