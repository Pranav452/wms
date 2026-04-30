"use client";

import React from 'react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  BarChart, Bar,
} from 'recharts'
import Header from '@/components/layout/Header'
import { ErrorState } from '@/components/shared/LoadingState'
import { DispatchSkeleton } from '@/components/shared/Skeleton'
import { useDashboard } from '@/context/DashboardContext'
import { formatNumber } from '@/lib/utils'

export default function DispatchPage() {
  const { data, loading, error } = useDashboard()

  if (loading) return <><Header title="Dispatch" breadcrumb="Dispatch" /><DispatchSkeleton /></>
  if (error)   return <><Header title="Dispatch" breadcrumb="Dispatch" /><ErrorState message={error} /></>
  if (!data)   return null

  const lastDate    = data.dailyDispatch.at(-1)?.PROCESS_DATE ?? ''
  const totalDisp   = data.dailyDispatch.reduce((s, r) => s + r.DISPATCH_QTY, 0)
  const maxDayDisp  = data.dailyDispatch.reduce((m, r) => Math.max(m, r.DISPATCH_QTY), 0)

  // Normalise delivery agents (TRISPEED / TRI SPEED → TRI SPEED)
  const agentData = data.deliveryAgents.slice(0, 8)

  return (
    <>
      <Header title="Dispatch" breadcrumb="Dispatch" />

      <div className="flex flex-col gap-4">
        {/* KPI strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total Dispatched',   value: formatNumber(totalDisp),      sub: 'all time' },
            { label: 'Peak Single Day',    value: formatNumber(maxDayDisp),     sub: 'units' },
            { label: 'Last Dispatch Date', value: lastDate || '—',              sub: '' },
            { label: 'Delivery Agents',    value: data.deliveryAgents.length,   sub: 'carriers used' },
          ].map(c => (
            <div key={c.label} className="bg-white rounded-2xl p-4 shadow-sm">
              <p className="text-xs text-gray-500 mb-1">{c.label}</p>
              <p className="text-2xl font-bold text-gray-900">{c.value}</p>
              {c.sub && <p className="text-xs text-gray-400 mt-0.5">{c.sub}</p>}
            </div>
          ))}
        </div>

        {/* Daily dispatch area chart */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-sm text-gray-900">Daily Dispatch Trend</h3>
            {lastDate && <span className="text-xs text-gray-400">Latest: {lastDate}</span>}
          </div>
          {data.dailyDispatch.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={data.dailyDispatch}>
                <defs>
                  <linearGradient id="dispatchGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="PROCESS_DATE" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={50} tickFormatter={v => formatNumber(v)} />
                <Tooltip
                  formatter={(v: unknown) => [formatNumber(v as number), 'Dispatch Qty']}
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }}
                />
                <Area type="monotone" dataKey="DISPATCH_QTY" stroke="#ef4444" strokeWidth={2}
                  fill="url(#dispatchGrad)" dot={false} activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-xs text-gray-400">No dispatch data</p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Client dispatch bars */}
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <h3 className="font-semibold text-sm text-gray-900 mb-4">Dispatch by Client</h3>
            {data.clientDispatch.length > 0 ? (
              <div className="space-y-3">
                {data.clientDispatch.map(c => {
                  const max = data.clientDispatch.reduce((m, x) => Math.max(m, x.DISPATCH_QTY), 0)
                  return (
                    <div key={c.CLIENT}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-medium text-gray-800 truncate max-w-[160px]">{c.CLIENT || '(unknown)'}</span>
                        <span className="text-gray-500 ml-2">{formatNumber(c.DISPATCH_QTY)} · {c.GIN_COUNT} GINs</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1.5">
                        <div className="bg-red-500 h-1.5 rounded-full" style={{ width: `${max ? (c.DISPATCH_QTY / max) * 100 : 0}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-xs text-gray-400">No client dispatch data</p>
            )}
          </div>

          {/* Delivery agents */}
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <h3 className="font-semibold text-sm text-gray-900 mb-4">By Delivery Agent</h3>
            {agentData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={agentData} layout="vertical" barSize={14}>
                  <XAxis type="number" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => formatNumber(v)} />
                  <YAxis type="category" dataKey="DELAGENT" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={80} />
                  <Tooltip
                    formatter={(v: unknown) => [formatNumber(v as number), 'Dispatched']}
                    contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }}
                  />
                  <Bar dataKey="DISPATCH_QTY" fill="#1e1e1e" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-xs text-gray-400">No agent data</p>
            )}
          </div>
        </div>

        {/* PO vs Dispatch table */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="p-4 border-b">
            <h3 className="font-semibold text-sm text-gray-900">PO vs Dispatch by Client</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="text-xs text-gray-400 uppercase bg-gray-50/60 border-b">
                <tr>
                  <th className="px-4 py-3 font-medium">Client</th>
                  <th className="px-4 py-3 font-medium">PO Qty</th>
                  <th className="px-4 py-3 font-medium">Dispatched</th>
                  <th className="px-4 py-3 font-medium">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.poVsDispatch.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400 text-xs">No data</td></tr>
                ) : (
                  data.poVsDispatch.map(r => (
                    <tr key={r.CLIENT} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 font-medium text-gray-900 truncate max-w-[120px]">{r.CLIENT || '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{formatNumber(r.PO_QTY)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{formatNumber(r.DISPATCHED_QTY)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={r.BALANCE_QTY > 0 ? 'text-orange-600 font-medium' : 'text-green-600 font-medium'}>
                          {formatNumber(r.BALANCE_QTY)}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}
