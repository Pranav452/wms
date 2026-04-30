"use client";

import React from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import Header from '@/components/layout/Header'
import { LoadingState, ErrorState } from '@/components/shared/LoadingState'
import { useDashboard } from '@/context/DashboardContext'
import { formatNumber, formatMonthKey } from '@/lib/utils'

export default function GRNPage() {
  const { data, loading, error } = useDashboard()

  if (loading) return <><Header title="GRN & Trends" breadcrumb="GRN" /><LoadingState /></>
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

  return (
    <>
      <Header title="GRN & Trends" breadcrumb="GRN" />

      <div className="flex flex-col gap-4">
        {/* KPI strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Receipts (12m)',   value: formatNumber(totalReceipt), sub: 'units received' },
            { label: 'Peak Month',       value: peakMonth?.label ?? '—',    sub: formatNumber(peakMonth?.RECEIPT_QTY ?? 0) + ' units' },
            { label: 'Avg Monthly',      value: formatNumber(avgMonthly),   sub: 'units/month' },
            { label: 'Units (60d GRN)',  value: formatNumber(totalUnitsIn), sub: `${grnDailyData.length} active days` },
          ].map(c => (
            <div key={c.label} className="bg-white rounded-2xl p-4 shadow-sm">
              <p className="text-xs text-gray-500 mb-1">{c.label}</p>
              <p className="text-2xl font-bold text-gray-900">{c.value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{c.sub}</p>
            </div>
          ))}
        </div>

        {/* Daily GRN activity (last 60 days) */}
        {grnDailyData.length > 0 && (
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <h3 className="font-semibold text-sm text-gray-900 mb-4">Daily GRN Units Received (last 60 days)</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={grnDailyData} barSize={10}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="GRN_DATE" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={50} tickFormatter={v => formatNumber(v)} />
                <Tooltip
                  formatter={(v: unknown) => [formatNumber(v as number), 'Units In']}
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }}
                />
                <Bar dataKey="UNITS_IN" name="Units In" fill="#ef4444" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Monthly receipt trend */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <h3 className="font-semibold text-sm text-gray-900 mb-4">Monthly Receipt Trend (last 12 months)</h3>
          {monthlyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={monthlyData} barSize={22}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={55} tickFormatter={v => formatNumber(v)} />
                <Tooltip
                  formatter={(v: unknown) => [formatNumber(v as number), 'Receipt Qty']}
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }}
                />
                <Bar dataKey="RECEIPT_QTY" name="Receipt Qty" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-xs text-gray-400">No monthly trend data</p>
          )}
        </div>

        {/* Daily dispatch trend */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <h3 className="font-semibold text-sm text-gray-900 mb-4">Daily Dispatch History</h3>
          {data.dailyDispatch.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={data.dailyDispatch} barSize={10}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="PROCESS_DATE" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={55} tickFormatter={v => formatNumber(v)} />
                <Tooltip
                  formatter={(v: unknown) => [formatNumber(v as number), 'Dispatch Qty']}
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }}
                />
                <Bar dataKey="DISPATCH_QTY" name="Dispatch Qty" fill="#1e1e1e" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-xs text-gray-400">No dispatch data</p>
          )}
        </div>
      </div>
    </>
  )
}
