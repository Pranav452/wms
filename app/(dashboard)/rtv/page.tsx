"use client";

import React from 'react'
import Header from '@/components/layout/Header'
import DataTable, { Column } from '@/components/shared/DataTable'
import { ErrorState } from '@/components/shared/LoadingState'
import { POSkeleton } from '@/components/shared/Skeleton'
import { useDashboard } from '@/context/DashboardContext'
import { formatNumber } from '@/lib/utils'
import type { RS23_RTVSummary, RS24_RTVDetail } from '@/types/dashboard'

const summaryColumns: Column<RS23_RTVSummary>[] = [
  { key: 'RETURNNO',      header: 'RO No',        className: 'font-medium text-gray-900 text-xs font-mono' },
  { key: 'GRTNNO',        header: 'Return Note',  className: 'text-gray-600 text-xs font-mono' },
  { key: 'CLIENTINVNO',   header: 'Client Inv',   className: 'text-gray-600 text-xs font-mono' },
  { key: 'RECEIVED_DATE', header: 'Received',     className: 'text-gray-600 text-xs' },
  { key: 'SOURCE',        header: 'Source',       className: 'text-gray-500 text-xs' },
  { key: 'SKU_COUNT',     header: 'SKUs',         render: r => formatNumber(r.SKU_COUNT) },
  { key: 'QTY_ISSUED',    header: 'Qty Issued',   render: r => formatNumber(r.QTY_ISSUED) },
  { key: 'QTY_RECEIVED',  header: 'Qty Received', render: r => formatNumber(r.QTY_RECEIVED) },
  {
    key: 'MISSING_QTY',
    header: 'Missing',
    render: r => (
      <span className={r.MISSING_QTY > 0 ? 'text-red-600 font-medium' : 'text-green-600 font-medium'}>
        {formatNumber(r.MISSING_QTY)}
      </span>
    ),
  },
  { key: 'USABLE_QTY',    header: 'Usable',       render: r => <span className="text-green-600">{formatNumber(r.USABLE_QTY)}</span> },
  {
    key: 'NONUSABLE_QTY',
    header: 'Non-usable',
    render: r => r.NONUSABLE_QTY > 0
      ? <span className="text-orange-600 font-medium">{formatNumber(r.NONUSABLE_QTY)}</span>
      : <span className="text-xs text-gray-300">0</span>,
  },
  { key: 'RETURN_TYPES',  header: 'Type',         className: 'text-gray-500 text-xs' },
]

const detailColumns: Column<RS24_RTVDetail>[] = [
  { key: 'RETURNNO',      header: 'RO No',    className: 'text-gray-600 text-xs font-mono' },
  { key: 'RECEIVED_DATE', header: 'Received', className: 'text-gray-600 text-xs' },
  { key: 'EAN',           header: 'EAN',      className: 'font-medium text-gray-900 text-xs font-mono' },
  { key: 'SKU',           header: 'SKU',      className: 'text-gray-600 text-xs font-mono' },
  { key: 'ITEMNAME',      header: 'Item',     className: 'text-gray-600 text-xs' },
  { key: 'RETURN_QTY',    header: 'Qty',      render: r => formatNumber(r.RETURN_QTY) },
  {
    key: 'CONDITION_',
    header: 'Condition',
    render: r => (
      <span className={r.CONDITION_ === 'USABLE' ? 'text-green-600 text-xs font-medium' : 'text-orange-600 text-xs font-medium'}>
        {r.CONDITION_}
      </span>
    ),
  },
  { key: 'CONTAINERNO',   header: 'Container', className: 'text-gray-500 text-xs font-mono' },
  { key: 'BOXNO',         header: 'Box',       className: 'text-gray-500 text-xs' },
]

export default function RTVPage() {
  const { data, loading, error } = useDashboard()

  if (loading) return <><Header title="RTV Returns" breadcrumb="RTV" /><POSkeleton /></>
  if (error)   return <><Header title="RTV Returns" breadcrumb="RTV" /><ErrorState message={error} /></>
  if (!data)   return null

  const k = data.rangeKpi

  return (
    <>
      <Header title="RTV Returns" breadcrumb="RTV" />

      <div className="flex flex-col gap-4">
        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Return Orders',  value: formatNumber(k?.RO_COUNT ?? 0),             sub: 'Myntra ROs in period' },
            { label: 'Qty Returned',   value: formatNumber(k?.RETURN_QTY ?? 0),           sub: 'pieces received back' },
            { label: 'Usable',         value: formatNumber(k?.RETURN_USABLE_QTY ?? 0),    sub: 'back into stock',     color: 'text-green-600' },
            { label: 'Non-usable',     value: formatNumber(k?.RETURN_NONUSABLE_QTY ?? 0), sub: 'damaged / rejected',  color: 'text-orange-500' },
          ].map(c => (
            <div key={c.label} className="bg-white rounded-2xl p-4 shadow-sm">
              <p className="text-xs text-gray-500 mb-1">{c.label}</p>
              <p className={`text-2xl font-bold ${(c as { color?: string }).color ?? 'text-gray-900'}`}>{c.value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{c.sub}</p>
            </div>
          ))}
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800">
          <strong>Note:</strong> <span className="font-mono">Qty Issued</span> is the quantity declared on the
          Myntra RO file. A separate scan-verify at receiving is not captured yet, so{' '}
          <span className="font-mono">Qty Received</span> mirrors it and <span className="font-mono">Missing</span>{' '}
          stays 0 until that step is added in the warehouse system.
        </div>

        <DataTable
          data={data.rtvSummary as unknown as Record<string, unknown>[]}
          columns={summaryColumns as unknown as Column<Record<string, unknown>>[]}
          filterKeys={['RETURNNO', 'GRTNNO', 'CLIENTINVNO'] as never[]}
          title={`Return Orders (${data.rtvSummary.length})`}
          pageSize={25}
        />

        <DataTable
          data={data.rtvDetail as unknown as Record<string, unknown>[]}
          columns={detailColumns as unknown as Column<Record<string, unknown>>[]}
          filterKeys={['EAN', 'SKU', 'RETURNNO', 'ITEMNAME'] as never[]}
          title={`EAN Detail (${formatNumber(data.rtvDetail.length)} lines)`}
          pageSize={25}
        />
      </div>
    </>
  )
}
