"use client";

import React, { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'

export interface Column<T> {
  key: keyof T | string
  header: string
  render?: (row: T) => React.ReactNode
  className?: string
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

  const filtered = useMemo(() => {
    if (!query.trim() || filterKeys.length === 0) return data
    const q = query.toLowerCase()
    return data.filter(row =>
      filterKeys.some(k => String(row[k] ?? '').toLowerCase().includes(q))
    )
  }, [data, query, filterKeys])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage   = Math.min(page, totalPages)
  const slice      = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)

  const handleQuery = (v: string) => { setQuery(v); setPage(1) }
  const handleSize  = (v: number) => { setPageSize(v); setPage(1) }

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      {/* Toolbar */}
      <div className="p-4 border-b flex flex-wrap gap-3 items-center justify-between">
        {title && <h3 className="font-semibold text-gray-900 text-sm">{title}</h3>}
        <div className="flex flex-wrap gap-2 items-center ml-auto">
          {extraFilters}
          {filterKeys.length > 0 && (
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={query}
                onChange={e => handleQuery(e.target.value)}
                placeholder="Search…"
                className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:border-red-400 w-48"
              />
            </div>
          )}
          <select
            value={pageSize}
            onChange={e => handleSize(Number(e.target.value))}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-red-400"
          >
            {PAGE_SIZE_OPTIONS.map(s => (
              <option key={s} value={s}>{s} / page</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-gray-600">
          <thead className="text-xs text-gray-400 uppercase bg-gray-50/60 border-b">
            <tr>
              {columns.map(col => (
                <th key={String(col.key)} className={`px-4 py-3 font-medium whitespace-nowrap ${col.className ?? ''}`}>
                  {col.header}
                </th>
              ))}
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
      <div className="px-4 py-3 border-t flex items-center justify-between text-xs text-gray-500">
        <span>
          {filtered.length === 0
            ? 'No records'
            : `${(safePage - 1) * pageSize + 1}–${Math.min(safePage * pageSize, filtered.length)} of ${filtered.length}`}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={safePage === 1}
            className="p-1 rounded hover:bg-gray-100 disabled:opacity-40 transition-colors"
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
                className={`w-7 h-7 rounded text-xs font-medium transition-colors ${
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
            className="p-1 rounded hover:bg-gray-100 disabled:opacity-40 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
