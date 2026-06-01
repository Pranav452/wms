"use client";

import React, { useMemo, useState } from 'react'
import Header from '@/components/layout/Header'
import StockReportDownload from '@/components/stock/StockReportDownload'
import DataTable, { Column } from '@/components/shared/DataTable'
import { ErrorState } from '@/components/shared/LoadingState'
import { StockSkeleton } from '@/components/shared/Skeleton'
import { useDashboard } from '@/context/DashboardContext'
import { formatNumber } from '@/lib/utils'
import type { RS3_StockDetail } from '@/types/dashboard'

const stockColumns: Column<RS3_StockDetail>[] = [
  { key: 'SRNO',        header: '#',           className: 'text-gray-400 w-10 text-xs' },
  { key: 'EAN',         header: 'EAN / SKU',   className: 'font-medium text-gray-900 text-xs' },
  { key: 'OLDEST_GRN',  header: 'First GRN',   className: 'text-gray-500 text-xs' },
  { key: 'AGING_DAYS',  header: 'Age',
    render: r => (
      <span className={`text-xs font-medium ${r.AGING_DAYS > 90 ? 'text-red-500' : r.AGING_DAYS > 60 ? 'text-orange-500' : 'text-gray-600'}`}>
        {r.AGING_DAYS}d
      </span>
    ),
  },
  { key: 'RECEIPT_QTY', header: 'Receipt',     render: r => formatNumber(r.RECEIPT_QTY) },
  { key: 'ISSUE_QTY',   header: 'Issued',      render: r => formatNumber(r.ISSUE_QTY) },
  { key: 'RETURN_QTY',  header: 'Returns',     render: r => formatNumber(r.RETURN_QTY) },
  {
    key: 'BAL_QTY',
    header: 'Balance',
    render: r => (
      <span className={`font-semibold ${r.BAL_QTY < 0 ? 'text-red-500' : 'text-gray-900'}`}>
        {formatNumber(r.BAL_QTY)}
      </span>
    ),
  },
  { key: 'PO_QTY', header: 'PO Qty', render: r => formatNumber(r.PO_QTY) },
]

export default function StockPage() {
  const { data, loading, error } = useDashboard()
  const [eanFilter, setEanFilter] = useState('')
  const [agingFilter, setAgingFilter] = useState<'ALL'|'0-30'|'31-60'|'61-90'|'90+'>('ALL')

  const filtered = useMemo(() => {
    if (!data?.stockDetail) return []
    let rows = data.stockDetail
    if (eanFilter.trim()) {
      const q = eanFilter.toLowerCase()
      rows = rows.filter(r => r.EAN.toLowerCase().includes(q))
    }
    if (agingFilter !== 'ALL') {
      rows = rows.filter(r => {
        const d = r.AGING_DAYS
        if (agingFilter === '0-30')  return d <= 30
        if (agingFilter === '31-60') return d > 30 && d <= 60
        if (agingFilter === '61-90') return d > 60 && d <= 90
        return d > 90
      })
    }
    return rows
  }, [data?.stockDetail, eanFilter, agingFilter])

  if (loading) return <><Header title="Stock Detail" breadcrumb="Stock" /><StockSkeleton /></>
  if (error)   return <><Header title="Stock Detail" breadcrumb="Stock" /><ErrorState message={error} /></>
  if (!data)   return null

  return (
    <>
      <Header title="Stock Detail" breadcrumb="Stock" />

      <StockReportDownload />

      <div className="flex flex-col gap-4">
        {/* Aging quick-filter pills */}
        <div className="flex gap-2 flex-wrap">
          {(['ALL','0-30','31-60','61-90','90+'] as const).map(b => (
            <button
              key={b}
              onClick={() => setAgingFilter(b)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                agingFilter === b ? 'bg-red-500 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-red-300'
              }`}
            >
              {b === 'ALL' ? 'All Ages' : `${b} days`}
            </button>
          ))}
        </div>

        <DataTable
          data={filtered as unknown as Record<string, unknown>[]}
          columns={stockColumns as unknown as Column<Record<string, unknown>>[]}
          filterKeys={['EAN'] as never[]}
          title={`Stock by SKU (${filtered.length.toLocaleString('en-IN')} items)`}
          pageSize={25}
          extraFilters={
            <input
              value={eanFilter}
              onChange={e => setEanFilter(e.target.value)}
              placeholder="Filter by EAN…"
              className="pl-3 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:border-red-400 w-44"
            />
          }
        />
      </div>
    </>
  )
}
