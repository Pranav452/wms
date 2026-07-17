"use client";

import React, { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import Header from '@/components/layout/Header'
import DataTable, { Column } from '@/components/shared/DataTable'
import { ErrorState } from '@/components/shared/LoadingState'
import { MRPSkeleton } from '@/components/shared/Skeleton'
import { useDashboard } from '@/context/DashboardContext'
import { formatNumber, bySPDate } from '@/lib/utils'
import type { RS5_MrpPending, RS16_MrpPendingContainer, RS26_MrpMismatch } from '@/types/dashboard'

const pendingColumns: Column<RS5_MrpPending>[] = [
  { key: 'EAN',         header: 'EAN / SKU',   className: 'font-medium text-gray-900 text-xs' },
  { key: 'PENDING_QTY', header: 'Pending Qty', render: r => <span className="text-orange-600 font-semibold">{formatNumber(r.PENDING_QTY)}</span> },
]

const pendingContCols: Column<RS16_MrpPendingContainer>[] = [
  { key: 'CONTAINERNO',   header: 'Container',      className: 'font-medium text-gray-900 text-xs' },
  { key: 'SHIPMENTTYPE',  header: 'Type',
    render: r => (
      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${r.SHIPMENTTYPE === 'IMP' ? 'bg-blue-50 text-blue-700' : 'bg-green-50 text-green-700'}`}>
        {r.SHIPMENTTYPE}
      </span>
    ),
  },
  { key: 'PENDING_TASKS', header: 'EANs Pending',   render: r => formatNumber(r.PENDING_TASKS) },
  { key: 'PENDING_QTY',   header: 'Qty Pending',    render: r => <span className="text-red-500 font-semibold">{formatNumber(r.PENDING_QTY)}</span> },
  { key: 'ASSIGNED_SINCE', header: 'Assigned Since', className: 'text-gray-500 text-xs' },
  { key: 'DAYS_PENDING',  header: 'Days Waiting',
    render: r => r.DAYS_PENDING != null
      ? <span className={r.DAYS_PENDING > 7 ? 'text-red-500 font-semibold' : 'text-gray-600'}>{r.DAYS_PENDING}d</span>
      : <span className="text-gray-400">—</span>,
  },
]

const mrpMismatchColumns: Column<RS26_MrpMismatch>[] = [
  { key: 'PONO',                  header: 'PO No',        className: 'font-medium text-gray-900 text-xs' },
  { key: 'Vendor Article Code',   header: 'Vendor Article', className: 'text-gray-600 text-xs' },
  { key: 'SKU',                   header: 'SKU',          className: 'text-gray-600 text-xs font-mono' },
  { key: 'EAN',                   header: 'EAN',          className: 'font-medium text-gray-900 text-xs font-mono' },
  { key: 'Item Name',             header: 'Item Name',    className: 'text-gray-600 text-xs' },
  { key: 'PO MRP',                header: 'PO MRP',       className: 'text-gray-700 text-xs' },
  {
    key: 'WMS Label MRP',
    header: 'Label MRP',
    render: r => r['WMS Label MRP']
      ? <span className="text-xs text-gray-700">{r['WMS Label MRP']}</span>
      : <span className="text-xs italic text-gray-400">no label</span>,
  },
  {
    key: 'Balance Qty',
    header: 'Balance Qty',
    render: r => <span className="font-semibold text-gray-900">{formatNumber(r['Balance Qty'])}</span>,
  },
]

export default function MrpPage() {
  const { data, loading, error } = useDashboard()
  const [exportingMismatch, setExportingMismatch] = useState(false)

  if (loading) return <><Header title="MRP / Labels" breadcrumb="MRP" /><MRPSkeleton /></>
  if (error)   return <><Header title="MRP / Labels" breadcrumb="MRP" /><ErrorState message={error} /></>
  if (!data)   return null

  const lb = data.labelStatus
  const total = lb ? lb.FP + lb.PENDING + lb.INPROCESS : 0
  const donePct = total ? Math.round((lb!.FP / total) * 100) : 0

  const mrpChartData = [...data.mrpDaily].sort((a, b) => bySPDate(a.COMPLETED_DATE, b.COMPLETED_DATE))

  // rangeKpi's mismatch counts are whole-warehouse (not date-filtered); fall back to
  // counting distinct EAN/PONO from the detail rows if the SP ever returns rangeKpi null.
  const mismatchRows     = data.mrpMismatch
  const mismatchEanCount = data.rangeKpi?.MRP_MISMATCH_EAN_COUNT ?? new Set(mismatchRows.map(r => r.EAN)).size
  const mismatchPoCount  = data.rangeKpi?.MRP_MISMATCH_PO_COUNT  ?? new Set(mismatchRows.map(r => r.PONO)).size

  async function exportMismatchExcel() {
    if (exportingMismatch || mismatchRows.length === 0) return
    setExportingMismatch(true)
    // Let "Exporting…" paint before the synchronous sheet build freezes the thread.
    await new Promise(r => setTimeout(r, 50))
    try {
      const XLSX = await import('xlsx')
      const rows = mismatchRows.map(r => ({
        'PO No':          r.PONO,
        'Vendor Article': r['Vendor Article Code'],
        'SKU':            r.SKU,
        'EAN':            r.EAN,
        'Item Name':      r['Item Name'],
        'PO MRP':         r['PO MRP'],
        'Label MRP':      r['WMS Label MRP'],
        'Balance Qty':    r['Balance Qty'],
      }))
      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'MRP Mismatch')
      const stamp = new Date().toLocaleDateString('en-CA') // local yyyy-mm-dd, not UTC
      XLSX.writeFile(wb, `mrp-mismatch_${stamp}.xlsx`)
    } finally {
      setExportingMismatch(false)
    }
  }

  return (
    <>
      <Header title="MRP / Labels" breadcrumb="MRP" />

      <div className="flex flex-col gap-4">
        {/* KPI row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'MRP Done',           value: formatNumber(data.kpi?.MRP_DONE_QTY ?? 0),    color: 'text-green-600', sub: 'units labelled' },
            { label: 'MRP Pending',        value: formatNumber(data.kpi?.MRP_PENDING_QTY ?? 0), color: 'text-orange-500', sub: 'units awaiting' },
            { label: 'Completion Rate',    value: `${donePct}%`,                                 color: donePct === 100 ? 'text-green-600' : 'text-gray-900', sub: 'of received qty' },
            { label: 'Pending Containers', value: data.mrpPendingContainers.length,               color: data.mrpPendingContainers.length > 0 ? 'text-red-500' : 'text-green-600', sub: 'need MRP labelling' },
          ].map(c => (
            <div key={c.label} className="bg-white rounded-2xl p-4 shadow-sm">
              <p className="text-xs text-gray-500 mb-1">{c.label}</p>
              <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{c.sub}</p>
            </div>
          ))}
        </div>

        {/* Progress bar */}
        {lb && (
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold text-sm text-gray-900">MRP Label Progress</h3>
              <span className="text-xs text-gray-500">{formatNumber(lb.FP)} / {formatNumber(total)} units</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-4 overflow-hidden">
              <div className="h-4 rounded-full bg-gradient-to-r from-green-400 to-green-500 transition-all"
                style={{ width: `${donePct}%` }} />
            </div>
            <div className="flex flex-wrap gap-4 text-xs text-gray-500 mt-3">
              {[
                { color: 'bg-green-500',  label: `FP / Done: ${formatNumber(lb.FP)}` },
                { color: 'bg-orange-400', label: `In Process: ${formatNumber(lb.INPROCESS)}` },
                { color: 'bg-red-400',    label: `Pending: ${formatNumber(lb.PENDING)}` },
              ].map(x => (
                <span key={x.label} className="flex items-center gap-1.5">
                  <span className={`w-2.5 h-2.5 rounded-full ${x.color} inline-block`} /> {x.label}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Containers awaiting MRP */}
        {data.mrpPendingContainers.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="p-4 border-b flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse inline-block" />
              <h3 className="font-semibold text-sm text-gray-900">Containers Awaiting MRP Labelling</h3>
            </div>
            <DataTable
              data={data.mrpPendingContainers as unknown as Record<string, unknown>[]}
              columns={pendingContCols as unknown as Column<Record<string, unknown>>[]}
              filterKeys={['CONTAINERNO'] as never[]}
              title=""
              pageSize={25}
            />
          </div>
        )}

        {/* Daily labelling productivity */}
        {mrpChartData.length > 0 && (
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <h3 className="font-semibold text-sm text-gray-900 mb-4">Daily MRP Labelling Output</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={mrpChartData} barSize={20}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis
                  dataKey="COMPLETED_DATE" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd"
                  tickFormatter={v => {
                    const d = new Date(v.split('/').reverse().join('-'))
                    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  }}
                />
                <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={55} tickFormatter={v => formatNumber(v)} />
                <Tooltip
                  formatter={(v: unknown) => [formatNumber(v as number), 'Units Labelled']}
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }}
                />
                <Bar dataKey="UNITS_LABELLED" name="Units Labelled" fill="#22c55e" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* EAN-level pending table */}
        {data.mrpPending.length > 0 && (
          <DataTable
            data={data.mrpPending as unknown as Record<string, unknown>[]}
            columns={pendingColumns as unknown as Column<Record<string, unknown>>[]}
            filterKeys={['EAN'] as never[]}
            title={`EANs with Pending MRP Labels (${data.mrpPending.length})`}
            pageSize={25}
          />
        )}

        {/* MRP Mismatches */}
        <div className="space-y-3">
          <div className="bg-white rounded-2xl shadow-sm p-4 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-semibold text-sm text-gray-900">MRP Mismatches</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Purchase-order MRP differs from the printed label MRP (includes items with no label printed yet)
              </p>
            </div>
            <div className="flex items-center gap-4 flex-shrink-0">
              <div className="text-right">
                <p className="text-lg font-bold text-red-500 leading-tight tabular-nums">{formatNumber(mismatchEanCount)}</p>
                <p className="text-[11px] text-gray-400 leading-none whitespace-nowrap">EANs affected</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-red-500 leading-tight tabular-nums">{formatNumber(mismatchPoCount)}</p>
                <p className="text-[11px] text-gray-400 leading-none whitespace-nowrap">POs affected</p>
              </div>
              <button
                onClick={exportMismatchExcel}
                disabled={exportingMismatch || mismatchRows.length === 0}
                title="Download the MRP mismatch list as Excel"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-medium transition-colors bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-gray-100 disabled:text-gray-300 disabled:cursor-not-allowed"
              >
                <svg className={`h-3.5 w-3.5 ${exportingMismatch ? 'animate-bounce' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3"/>
                </svg>
                {exportingMismatch ? 'Exporting…' : 'Export Excel'}
              </button>
            </div>
          </div>
          <DataTable
            data={mismatchRows as unknown as Record<string, unknown>[]}
            columns={mrpMismatchColumns as unknown as Column<Record<string, unknown>>[]}
            filterKeys={['PONO', 'EAN', 'SKU', 'Vendor Article Code'] as never[]}
            title=""
            pageSize={25}
          />
        </div>
      </div>
    </>
  )
}
