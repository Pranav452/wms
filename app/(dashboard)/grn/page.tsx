"use client";

import React, { useState, useMemo } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import Header from '@/components/layout/Header'
import { ErrorState } from '@/components/shared/LoadingState'
import { GRNSkeleton } from '@/components/shared/Skeleton'
import { useDashboard } from '@/context/DashboardContext'
import { formatNumber, formatMonthKey } from '@/lib/utils'

const RANGES = [
  { label: 'Last 7 days',    value: '7d',  days: 7 },
  { label: 'Last 30 days',   value: '30d', days: 30 },
  { label: 'Last 60 days',   value: '60d', days: 60 },
]

const DISPATCH_RANGES = [
  { label: '7d',  days: 7 },
  { label: '30d', days: 30 },
  { label: 'All', days: 99999 },
]

export default function GRNPage() {
  const { data, loading, error } = useDashboard()
  const [grnRange, setGrnRange] = useState('60d')
  const [dispRange, setDispRange] = useState('30d')

  if (loading) return <><Header title="GRN & Trends" breadcrumb="GRN" /><GRNSkeleton /></>
  if (error)   return <><Header title="GRN & Trends" breadcrumb="GRN" /><ErrorState message={error} /></>
  if (!data)   return null

  const monthlyData = [...data.monthlyTrend]
    .sort((a, b) => a.MONTH_KEY.localeCompare(b.MONTH_KEY))
    .map(m => ({ ...m, label: formatMonthKey(m.MONTH_KEY) }))

  const totalReceipt = monthlyData.reduce((s, r) => s + r.RECEIPT_QTY, 0)
  const peakMonth    = monthlyData.reduce((p, c) => c.RECEIPT_QTY > (p?.RECEIPT_QTY ?? 0) ? c : p, monthlyData[0])
  const avgMonthly   = monthlyData.length ? Math.round(totalReceipt / monthlyData.length) : 0

  const grnDailyData = [...data.grnDaily].sort((a, b) => a.GRN_DATE.localeCompare(b.GRN_DATE))
  const totalUnitsIn = grnDailyData.reduce((s, r) => s + (r.UNITS_IN ?? 0), 0)

  // filter GRN daily by range
  const grnDays = RANGES.find(r => r.value === grnRange)?.days ?? 60
  const filteredGRN = grnDailyData.slice(-grnDays)

  // filter dispatch by range
  const allDispatch = [...data.dailyDispatch].sort((a, b) => a.PROCESS_DATE.localeCompare(b.PROCESS_DATE))
  const dispDays = DISPATCH_RANGES.find(r => r.label === dispRange)?.days ?? 30
  const filteredDisp = allDispatch.slice(-dispDays)

  return (
    <>
      <Header title="GRN & Trends" breadcrumb="GRN" />

      <div className="flex flex-col gap-4">
        {/* KPI strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Receipts (12m)',  value: formatNumber(totalReceipt), sub: 'units received' },
            { label: 'Peak Month',      value: peakMonth?.label ?? '—',    sub: formatNumber(peakMonth?.RECEIPT_QTY ?? 0) + ' units' },
            { label: 'Avg Monthly',     value: formatNumber(avgMonthly),   sub: 'units/month' },
            { label: 'Units In (60d)',  value: formatNumber(totalUnitsIn), sub: `${grnDailyData.length} active days` },
          ].map(c => (
            <div key={c.label} className="bg-white rounded-2xl p-4 shadow-sm">
              <p className="text-xs text-gray-500 mb-1">{c.label}</p>
              <p className="text-2xl font-bold text-gray-900">{c.value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{c.sub}</p>
            </div>
          ))}
        </div>

        {/* Daily GRN — interactive area chart */}
        {grnDailyData.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
              <div>
                <h3 className="font-semibold text-sm text-gray-900">Daily GRN Units Received</h3>
                <p className="text-xs text-gray-400 mt-0.5">{filteredGRN.length} days shown · {formatNumber(filteredGRN.reduce((s,r)=>s+r.UNITS_IN,0))} units</p>
              </div>
              <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                {RANGES.map(r => (
                  <button
                    key={r.value}
                    onClick={() => setGrnRange(r.value)}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                      grnRange === r.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {r.label.replace('Last ', '')}
                  </button>
                ))}
              </div>
            </div>
            <div className="px-5 pb-5 pt-4">
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={filteredGRN}>
                  <defs>
                    <linearGradient id="grnGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis
                    dataKey="GRN_DATE" tick={{ fontSize: 10 }} axisLine={false} tickLine={false}
                    interval="preserveStartEnd"
                    tickFormatter={v => {
                      const d = new Date(v.split('/').reverse().join('-'))
                      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    }}
                  />
                  <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={50} tickFormatter={v => formatNumber(v)} />
                  <Tooltip
                    cursor={{ stroke: '#ef4444', strokeWidth: 1, strokeDasharray: '4 2' }}
                    contentStyle={{ fontSize: 11, borderRadius: 10, border: '1px solid #e5e7eb', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                    formatter={(v: unknown) => [formatNumber(v as number), 'Units In']}
                    labelFormatter={l => {
                      const d = new Date(l.split('/').reverse().join('-'))
                      return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                    }}
                  />
                  <Area type="monotone" dataKey="UNITS_IN" stroke="#ef4444" strokeWidth={2}
                    fill="url(#grnGrad)" dot={false} activeDot={{ r: 4, fill: '#ef4444', strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Monthly receipt trend — area chart */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50">
            <h3 className="font-semibold text-sm text-gray-900">Monthly Receipt Trend</h3>
            <p className="text-xs text-gray-400 mt-0.5">Last 12 months</p>
          </div>
          <div className="px-5 pb-5 pt-4">
            {monthlyData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={monthlyData}>
                  <defs>
                    <linearGradient id="monthGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.12} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={55} tickFormatter={v => formatNumber(v)} />
                  <Tooltip
                    cursor={{ stroke: '#ef4444', strokeWidth: 1, strokeDasharray: '4 2' }}
                    contentStyle={{ fontSize: 11, borderRadius: 10, border: '1px solid #e5e7eb', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                    formatter={(v: unknown) => [formatNumber(v as number), 'Receipt Qty']}
                  />
                  <Area type="monotone" dataKey="RECEIPT_QTY" name="Receipt Qty" stroke="#ef4444" strokeWidth={2}
                    fill="url(#monthGrad)" dot={{ r: 3, fill: '#ef4444', strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: '#ef4444', strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-xs text-gray-400 py-8 text-center">No monthly trend data</p>
            )}
          </div>
        </div>

        {/* Daily dispatch — area chart with range selector */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
            <div>
              <h3 className="font-semibold text-sm text-gray-900">Daily Dispatch History</h3>
              <p className="text-xs text-gray-400 mt-0.5">{filteredDisp.length} days · {formatNumber(filteredDisp.reduce((s,r)=>s+r.DISPATCH_QTY,0))} units</p>
            </div>
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              {DISPATCH_RANGES.map(r => (
                <button
                  key={r.label}
                  onClick={() => setDispRange(r.label)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                    dispRange === r.label ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <div className="px-5 pb-5 pt-4">
            {filteredDisp.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={filteredDisp}>
                  <defs>
                    <linearGradient id="dispGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#1e1e1e" stopOpacity={0.12} />
                      <stop offset="95%" stopColor="#1e1e1e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis dataKey="PROCESS_DATE" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={55} tickFormatter={v => formatNumber(v)} />
                  <Tooltip
                    cursor={{ stroke: '#1e1e1e', strokeWidth: 1, strokeDasharray: '4 2' }}
                    contentStyle={{ fontSize: 11, borderRadius: 10, border: '1px solid #e5e7eb', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                    formatter={(v: unknown) => [formatNumber(v as number), 'Dispatch Qty']}
                  />
                  <Area type="monotone" dataKey="DISPATCH_QTY" stroke="#1e1e1e" strokeWidth={2}
                    fill="url(#dispGrad)" dot={false} activeDot={{ r: 4, fill: '#1e1e1e', strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-xs text-gray-400 py-8 text-center">No dispatch data</p>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
