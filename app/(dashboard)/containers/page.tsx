"use client";

import React, { useMemo, useState } from 'react'
import Header from '@/components/layout/Header'
import DataTable, { Column } from '@/components/shared/DataTable'
import { ErrorState } from '@/components/shared/LoadingState'
import { ContainersSkeleton } from '@/components/shared/Skeleton'
import { useDashboard } from '@/context/DashboardContext'
import { formatNumber } from '@/lib/utils'
import type { RS13_Container } from '@/types/dashboard'

const containerColumns: Column<RS13_Container>[] = [
  { key: 'CONTAINERNO',    header: 'Container / Shipment No', className: 'font-medium text-gray-900 text-xs' },
  { key: 'SHIPMENTTYPE',   header: 'Type',
    render: r => (
      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${r.SHIPMENTTYPE === 'IMP' ? 'bg-blue-50 text-blue-700' : 'bg-green-50 text-green-700'}`}>
        {r.SHIPMENTTYPE}
      </span>
    ),
  },
  { key: 'FIRST_GRN_DATE', header: 'First GRN',  className: 'text-gray-600 text-xs' },
  { key: 'LAST_GRN_DATE',  header: 'Last GRN',   className: 'text-gray-600 text-xs' },
  { key: 'SKU_COUNT',      header: 'SKUs',       render: r => formatNumber(r.SKU_COUNT) },
  { key: 'RECEIPT_QTY',   header: 'Receipt Qty', render: r => formatNumber(r.RECEIPT_QTY) },
  {
    key: 'AGING_DAYS',
    header: 'Age (days)',
    render: r => (
      <span className={`text-xs font-semibold ${r.AGING_DAYS > 90 ? 'text-red-500' : r.AGING_DAYS > 60 ? 'text-orange-500' : 'text-green-600'}`}>
        {r.AGING_DAYS}d
      </span>
    ),
  },
]

export default function ContainersPage() {
  const { data, loading, error } = useDashboard()
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'IMP' | 'LOC'>('ALL')

  const filtered = useMemo(() => {
    if (!data?.containers) return []
    if (typeFilter === 'ALL') return data.containers
    return data.containers.filter(c => c.SHIPMENTTYPE === typeFilter)
  }, [data?.containers, typeFilter])

  if (loading) return <><Header title="Containers" breadcrumb="Containers" /><ContainersSkeleton /></>
  if (error)   return <><Header title="Containers" breadcrumb="Containers" /><ErrorState message={error} /></>
  if (!data)   return null

  const imp = data.containers.filter(c => c.SHIPMENTTYPE === 'IMP')
  const loc = data.containers.filter(c => c.SHIPMENTTYPE === 'LOC')
  const aged = data.containers.filter(c => c.AGING_DAYS > 90)

  return (
    <>
      <Header title="Containers" breadcrumb="Containers" />

      <div className="flex flex-col gap-4">
        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total Containers', value: data.containers.length, sub: 'all shipments' },
            { label: 'Import (IMP)',      value: imp.length,            sub: `${imp.reduce((s,c)=>s+c.RECEIPT_QTY,0).toLocaleString('en-IN')} units rcvd` },
            { label: 'Local (LOC)',       value: loc.length,            sub: `${loc.reduce((s,c)=>s+c.RECEIPT_QTY,0).toLocaleString('en-IN')} units rcvd` },
            { label: 'Aged 90+ Days',     value: aged.length,           sub: 'containers', color: aged.length > 0 ? 'text-red-500' : 'text-gray-900' },
          ].map(c => (
            <div key={c.label} className="bg-white rounded-2xl p-4 shadow-sm">
              <p className="text-xs text-gray-500 mb-1">{c.label}</p>
              <p className={`text-2xl font-bold ${(c as { color?: string }).color ?? 'text-gray-900'}`}>{c.value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{c.sub}</p>
            </div>
          ))}
        </div>

        {/* Type filter pills */}
        <div className="flex gap-2">
          {(['ALL', 'IMP', 'LOC'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${
                typeFilter === t ? 'bg-red-500 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-red-300'
              }`}
            >
              {t === 'ALL' ? 'All' : t}
            </button>
          ))}
        </div>

        <DataTable
          data={filtered as unknown as Record<string, unknown>[]}
          columns={containerColumns as unknown as Column<Record<string, unknown>>[]}
          filterKeys={['CONTAINERNO'] as never[]}
          title={`Containers (${filtered.length})`}
          pageSize={25}
        />
      </div>
    </>
  )
}
