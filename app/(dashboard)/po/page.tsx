"use client";

import React from 'react'
import Header from '@/components/layout/Header'
import DataTable, { Column } from '@/components/shared/DataTable'
import { ErrorState } from '@/components/shared/LoadingState'
import { POSkeleton } from '@/components/shared/Skeleton'
import { useDashboard } from '@/context/DashboardContext'
import { formatNumber } from '@/lib/utils'
import type { RS12_POTracking } from '@/types/dashboard'

const poColumns: Column<RS12_POTracking>[] = [
  { key: 'PONO',               header: 'PO No',        className: 'font-medium text-gray-900 text-xs' },
  { key: 'CLIENT',             header: 'Client',        className: 'text-gray-600 text-xs' },
  {
    key: 'STR_CREATION_DATE',
    header: 'STR Created',
    render: r => r.STR_CREATION_DATE
      ? <span className="text-xs text-gray-600">{r.STR_CREATION_DATE}</span>
      : <span className="text-xs text-gray-300">—</span>,
  },
  { key: 'SKU_COUNT',          header: 'SKUs',          render: r => formatNumber(r.SKU_COUNT) },
  { key: 'PO_QTY',             header: 'PO Qty',        render: r => formatNumber(r.PO_QTY) },
  { key: 'DISPATCHED',         header: 'Dispatched',    render: r => formatNumber(r.DISPATCHED) },
  {
    key: 'BALANCE',
    header: 'Balance',
    render: r => (
      <span className={r.BALANCE > 0 ? 'text-orange-600 font-medium' : 'text-green-600 font-medium'}>
        {formatNumber(r.BALANCE)}
      </span>
    ),
  },
  {
    key: 'LAST_DISPATCH_DATE',
    header: 'Last Dispatched',
    render: r => r.LAST_DISPATCH_DATE
      ? <span className="text-xs text-gray-600">{r.LAST_DISPATCH_DATE}</span>
      : <span className="text-xs text-gray-300">—</span>,
  },
  {
    key: 'GIN_NOS',
    header: 'GIN Ref',
    render: r => r.GIN_NOS
      ? <span className="text-xs text-blue-600 font-mono">{r.GIN_NOS}</span>
      : <span className="text-xs text-gray-300">—</span>,
  },
]

export default function POPage() {
  const { data, loading, error } = useDashboard()

  if (loading) return <><Header title="PO Tracking" breadcrumb="PO" /><POSkeleton /></>
  if (error)   return <><Header title="PO Tracking" breadcrumb="PO" /><ErrorState message={error} /></>
  if (!data)   return null

  const fullyDispatched = data.poTracking.filter(p => p.BALANCE <= 0).length
  const pending         = data.poTracking.filter(p => p.BALANCE > 0).length
  const unfulfilled     = formatNumber(data.kpi?.UNFULFILLED_PO_QTY ?? 0)

  return (
    <>
      <Header title="PO Tracking" breadcrumb="PO" />

      <div className="flex flex-col gap-4">
        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total POs',        value: data.poTracking.length, sub: 'purchase orders' },
            { label: 'Fully Dispatched', value: fullyDispatched,        sub: 'POs complete',     color: 'text-green-600' },
            { label: 'Pending Dispatch', value: pending,                sub: 'POs outstanding',  color: pending > 0 ? 'text-orange-500' : 'text-gray-900' },
            { label: 'Unfulfilled Qty',  value: unfulfilled,            sub: 'units still owed', color: 'text-red-500' },
          ].map(c => (
            <div key={c.label} className="bg-white rounded-2xl p-4 shadow-sm">
              <p className="text-xs text-gray-500 mb-1">{c.label}</p>
              <p className={`text-2xl font-bold ${(c as { color?: string }).color ?? 'text-gray-900'}`}>{c.value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{c.sub}</p>
            </div>
          ))}
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800">
          <strong>Tip:</strong> Search by PO number (e.g.{' '}
          <span className="font-mono">STNITFABP230426-10</span>) — the{' '}
          <span className="font-mono">GIN Ref</span> column shows the linked dispatch note.
        </div>

        <DataTable
          data={data.poTracking as unknown as Record<string, unknown>[]}
          columns={poColumns as unknown as Column<Record<string, unknown>>[]}
          filterKeys={['PONO', 'CLIENT'] as never[]}
          title={`PO Tracking (${data.poTracking.length} orders)`}
          pageSize={25}
        />
      </div>
    </>
  )
}
