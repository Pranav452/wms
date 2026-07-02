"use client";

import React, { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown, Search } from 'lucide-react'

export interface Column<T> {
  key: keyof T | string
  header: string
  render?: (row: T) => React.ReactNode
  className?: string
  sortable?: boolean
}

// Dates arrive from the SP as dd/mm/yyyy strings (CONVERT style 103), so plain
// string comparison would order them wrong — normalize to a timestamp first.
const DDMMYYYY = /^(\d{2})\/(\d{2})\/(\d{4})$/

function sortValue(v: unknown): number | string | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') return v
  const s = String(v).trim()
  const m = DDMMYYYY.exec(s)
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]).getTime()
  const n = Number(s.replace(/,/g, ''))
  if (!Number.isNaN(n)) return n
  return s.toLowerCase()
}

function compareRows(a: unknown, b: unknown, dir: 'asc' | 'desc'): number {
  const av = sortValue(a)
  const bv = sortValue(b)
  if (av === null && bv === null) return 0
  if (av === null) return 1  // empties always sink to the bottom
  if (bv === null) return -1
  const cmp = typeof av === 'number' && typeof bv === 'number'
    ? av - bv
    : String(av).localeCompare(String(bv))
  return dir === 'asc' ? cmp : -cmp
}

interface Props<T extends Record<string, unknown>> {
  data:        T[]
  columns:     Column<T>[]
  filterKeys?: (keyof T)[]
  pageSize?:   number
  title?:      string
  extraFilters?: React.ReactNode
}

const PAGE_SIZE_OPTIONS = [10, 25, 50]

export default function DataTable<T extends Record<string, unknown>>({
  data,
  columns,
  filterKeys = [],
  pageSize: defaultSize = 25,
  title,
  extraFilters,
}: Props<T>) {
  const [query,    setQuery]    = useState('')
  const [page,     setPage]     = useState(1)
  const [pageSize, setPageSize] = useState(defaultSize)
  const [sortKey,  setSortKey]  = useState<string | null>(null)
  const [sortDir,  setSortDir]  = useState<'asc' | 'desc'>('asc')

  const filtered = useMemo(() => {
    if (!query.trim() || filterKeys.length === 0) return data
    const q = query.toLowerCase()
    return data.filter(row =>
      filterKeys.some(k => String(row[k] ?? '').toLowerCase().includes(q))
    )
  }, [data, query, filterKeys])

  const sorted = useMemo(() => {
    if (!sortKey) return filtered
    return [...filtered].sort((a, b) => compareRows(a[sortKey], b[sortKey], sortDir))
  }, [filtered, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage   = Math.min(page, totalPages)
  const slice      = sorted.slice((safePage - 1) * pageSize, safePage * pageSize)

  const handleQuery = (v: string) => { setQuery(v); setPage(1) }
  const handleSize  = (v: number) => { setPageSize(v); setPage(1) }

  // Click cycles asc → desc → original order
  const handleSort = (key: string) => {
    if (sortKey !== key)          { setSortKey(key); setSortDir('asc') }
    else if (sortDir === 'asc')   { setSortDir('desc') }
    else                          { setSortKey(null) }
    setPage(1)
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      {/* Toolbar */}
      <div className="p-4 border-b flex flex-wrap gap-3 items-center justify-between">
        {title && <h3 className="font-semibold text-gray-900 text-sm">{title}</h3>}
        <div className="flex flex-wrap gap-2 items-center w-full sm:w-auto sm:ml-auto">
          {extraFilters}
          {filterKeys.length > 0 && (
            <div className="relative flex-1 min-w-[8rem] sm:flex-none">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={query}
                onChange={e => handleQuery(e.target.value)}
                placeholder="Search…"
                className="pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-red-400 w-full sm:w-48"
              />
            </div>
          )}
          <select
            value={pageSize}
            onChange={e => handleSize(Number(e.target.value))}
            className="text-xs border border-gray-200 rounded-lg px-2 py-2 outline-none focus:border-red-400 flex-shrink-0"
          >
            {PAGE_SIZE_OPTIONS.map(s => (
              <option key={s} value={s}>{s} / page</option>
            ))}
          </select>
        </div>
      </div>

      {/* Mobile stacked cards */}
      <div className="md:hidden">
        {slice.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-400 text-sm">No data found</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {slice.map((row, i) => (
              <li key={i} className="px-4 py-3.5">
                <dl className="space-y-1.5">
                  {columns.map(col => (
                    <div key={String(col.key)} className="flex items-start justify-between gap-3">
                      <dt className="text-[11px] uppercase tracking-wide text-gray-400 font-medium shrink-0 pt-0.5">
                        {col.header}
                      </dt>
                      <dd className="text-sm text-gray-700 text-right min-w-0 break-words">
                        {col.render
                          ? col.render(row)
                          : String(row[col.key as keyof T] ?? '—')}
                      </dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Table (tablet/desktop) */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left text-sm text-gray-600">
          <thead className="text-xs text-gray-400 uppercase bg-gray-50/60 border-b">
            <tr>
              {columns.map(col => {
                const key      = String(col.key)
                const sortable = col.sortable !== false
                const active   = sortKey === key
                return (
                  <th
                    key={key}
                    aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                    className={`px-4 py-3 font-medium whitespace-nowrap ${col.className ?? ''}`}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => handleSort(key)}
                        aria-label={`Sort by ${col.header}${active ? ` (${sortDir === 'asc' ? 'ascending' : 'descending'})` : ''}`}
                        className={`inline-flex items-center gap-1 uppercase transition-colors hover:text-gray-600 ${active ? 'text-red-500' : ''}`}
                      >
                        {col.header}
                        {active
                          ? sortDir === 'asc'
                            ? <ArrowUp className="w-3 h-3" />
                            : <ArrowDown className="w-3 h-3" />
                          : <ChevronsUpDown className="w-3 h-3 opacity-50" />}
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {slice.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-gray-400 text-sm">
                  No data found
                </td>
              </tr>
            ) : (
              slice.map((row, i) => (
                <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                  {columns.map(col => (
                    <td key={String(col.key)} className={`px-4 py-3 whitespace-nowrap ${col.className ?? ''}`}>
                      {col.render
                        ? col.render(row)
                        : String(row[col.key as keyof T] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="px-4 py-3 border-t flex items-center justify-between gap-2 text-xs text-gray-500">
        <span className="min-w-0 truncate">
          {sorted.length === 0
            ? 'No records'
            : `${(safePage - 1) * pageSize + 1}–${Math.min(safePage * pageSize, sorted.length)} of ${sorted.length}`}
        </span>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={safePage === 1}
            aria-label="Previous page"
            className="flex items-center justify-center w-9 h-9 sm:w-8 sm:h-8 rounded hover:bg-gray-100 disabled:opacity-40 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            let pageNum: number
            if (totalPages <= 5) pageNum = i + 1
            else if (safePage <= 3) pageNum = i + 1
            else if (safePage >= totalPages - 2) pageNum = totalPages - 4 + i
            else pageNum = safePage - 2 + i
            return (
              <button
                key={pageNum}
                onClick={() => setPage(pageNum)}
                className={`w-9 h-9 sm:w-8 sm:h-8 rounded text-xs font-medium transition-colors ${
                  pageNum === safePage
                    ? 'bg-red-500 text-white'
                    : 'hover:bg-gray-100'
                }`}
              >
                {pageNum}
              </button>
            )
          })}
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={safePage === totalPages}
            aria-label="Next page"
            className="flex items-center justify-center w-9 h-9 sm:w-8 sm:h-8 rounded hover:bg-gray-100 disabled:opacity-40 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
