"use client";

import React from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import Header from '@/components/layout/Header'
import DataTable, { Column } from '@/components/shared/DataTable'
import { ErrorState } from '@/components/shared/LoadingState'
import { MRPSkeleton } from '@/components/shared/Skeleton'
import { useDashboard } from '@/context/DashboardContext'
import { formatNumber } from '@/lib/utils'
import type { RS5_MrpPending, RS16_MrpPendingContainer } from '@/types/dashboard'

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

export default function MrpPage() {
  const { data, loading, error } = useDashboard()

  if (loading) return <><Header title="MRP / Labels" breadcrumb="MRP" /><MRPSkeleton /></>
  if (error)   return <><Header title="MRP / Labels" breadcrumb="MRP" /><ErrorState message={error} /></>
  if (!data)   return null

  const lb = data.labelStatus
  const total = lb ? lb.FP + lb.PENDING + lb.INPROCESS : 0
  const donePct = total ? Math.round((lb!.FP / total) * 100) : 0

  const mrpChartData = [...data.mrpDaily].sort((a, b) => a.COMPLETED_DATE.localeCompare(b.COMPLETED_DATE))

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
                <XAxis dataKey="COMPLETED_DATE" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
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
      </div>
    </>
  )
}
