"use client";

import React from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import {
  Package, ArrowDownToLine, ArrowUpFromLine, RotateCcw,
  ShoppingCart, Boxes, Clock, Container, TrendingDown, Tag,
} from 'lucide-react'
import Header from '@/components/layout/Header'
import { ErrorState } from '@/components/shared/LoadingState'
import { OverviewSkeleton } from '@/components/shared/Skeleton'
import { useDashboard } from '@/context/DashboardContext'
import { formatNumber } from '@/lib/utils'

interface KPICardProps { icon: React.ReactNode; label: string; value: string | number; sub?: string }
function KPICard({ icon, label, value, sub }: KPICardProps) {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-50 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="bg-red-50 p-1.5 rounded-md">{icon}</div>
        <span className="text-xs text-gray-500 font-medium">{label}</span>
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

const AGING_COLORS: Record<string, string> = {
  '0-30': '#86efac', '31-60': '#fde68a', '61-90': '#fb923c', '90+': '#ef4444',
}
const LABEL_COLORS = ['#22c55e', '#ef4444', '#f59e0b']
// Single-hue palette: red shades dark→light (no rainbow)
const ARTICLE_COLORS = ['#ef4444', '#f87171', '#fca5a5', '#fecaca', '#fee2e2', '#1e1e1e', '#374151', '#6b7280']

export default function OverviewPage() {
  const { data, loading, error, fromDate } = useDashboard()

  if (loading) return <><Header title="Overview" breadcrumb="Overview" /><OverviewSkeleton /></>
  if (error)   return <><Header title="Overview" breadcrumb="Overview" /><ErrorState message={error} /></>
  if (!data)   return null

  const k  = data.kpi
  const lb = data.labelStatus
  const bl = data.backlog

  // With a date range active, the movement KPIs show the window totals
  // (RS21); balance/stock figures stay as-on the end date.
  const ranged  = Boolean(fromDate) && data.rangeKpi !== null
  const rk      = data.rangeKpi
  const flowSub = ranged ? 'in period' : undefined
  const receiptQty = ranged ? rk!.GRN_QTY      : k?.RECEIPT_QTY ?? 0
  const issueQty   = ranged ? rk!.DISPATCH_QTY : k?.ISSUE_QTY ?? 0
  const returnQty  = ranged ? rk!.RETURN_QTY   : k?.RETURN_QTY ?? 0

  const labelDonutData = lb ? [
    { name: 'FP / Done',  value: lb.FP },
    { name: 'Pending',    value: lb.PENDING },
    { name: 'In Process', value: lb.INPROCESS },
  ] : []
  const totalLabels = lb ? lb.FP + lb.PENDING + lb.INPROCESS : 0

  // Client receipt bar data (RS14) — top 6
  const clientData = [...data.clientReceipt].slice(0, 6)

  // Article type data (RS17)
  const articleData = [...data.articleTypes].sort((a, b) => b.PO_QTY - a.PO_QTY).slice(0, 8)
  const totalArtQty = articleData.reduce((s, a) => s + a.PO_QTY, 0)

  // PO value by article (RS20)
  const poValueData = [...data.poValue].sort((a, b) => b.TOTAL_MRP_VALUE - a.TOTAL_MRP_VALUE).slice(0, 6)

  return (
    <>
      <Header title="Overview" breadcrumb="Overview" />

      {/* ── Row 1: Headline KPIs ── */}
      <div className="grid grid-cols-12 gap-4 mb-4">
        <div className="col-span-12 sm:col-span-4 bg-[#1e1e1e] rounded-2xl p-6 text-white flex flex-col justify-between relative shadow-sm">
          <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/30 rounded-full blur-3xl -mr-10 -mt-10" />
          <div>
            <div className="bg-red-500/20 w-10 h-10 rounded-lg flex items-center justify-center mb-4">
              <Package className="text-red-500 w-5 h-5" />
            </div>
            <h3 className="text-gray-400 text-sm">Total Balance Stock</h3>
          </div>
          <div>
            <div className="flex items-end justify-between mt-6">
              <span className="text-4xl font-bold">{formatNumber(k?.BAL_QTY ?? 0)}</span>
              <span className="text-xs bg-white/10 px-2 py-1 rounded-full">units</span>
            </div>
            <div className="flex gap-3 mt-4">
              <div className="flex-1 bg-white/5 rounded-xl p-3">
                <p className="text-[10px] text-gray-400 mb-1">Finished</p>
                <p className="text-sm font-semibold text-green-400">{formatNumber((k?.BAL_QTY ?? 0) - (k?.MRP_PENDING_QTY ?? 0))}</p>
              </div>
              <div className="flex-1 bg-white/5 rounded-xl p-3">
                <p className="text-[10px] text-gray-400 mb-1">Unfinished</p>
                <p className="text-sm font-semibold text-yellow-400">{formatNumber(k?.MRP_PENDING_QTY ?? 0)}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="col-span-12 sm:col-span-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KPICard icon={<ArrowDownToLine className="w-4 h-4 text-red-500" />} label={ranged ? 'Receipt' : 'Total Receipt'}  value={formatNumber(receiptQty)} sub={flowSub} />
          <KPICard icon={<ArrowUpFromLine  className="w-4 h-4 text-red-500" />} label={ranged ? 'Issued'  : 'Total Issued'}  value={formatNumber(issueQty)}   sub={flowSub} />
          <KPICard icon={<RotateCcw        className="w-4 h-4 text-red-500" />} label={ranged ? 'Returns' : 'Total Returns'} value={formatNumber(returnQty)}  sub={flowSub} />
          <KPICard icon={<ShoppingCart     className="w-4 h-4 text-red-500" />} label="PO Qty"         value={formatNumber(k?.PO_QTY ?? 0)} />
          <KPICard icon={<Boxes            className="w-4 h-4 text-red-500" />} label="Containers"     value={formatNumber(k?.CONTAINER_COUNT ?? 0)} />
          <KPICard icon={<Package          className="w-4 h-4 text-red-500" />} label="Unique SKUs"    value={formatNumber(k?.SKU_COUNT ?? 0)} />
          <KPICard icon={<Clock            className="w-4 h-4 text-red-500" />} label="Aging 90+ Days" value={formatNumber(k?.AGING_90_PLUS ?? 0)} sub="units" />
          <KPICard icon={<TrendingDown     className="w-4 h-4 text-red-500" />} label="Unfulfilled PO" value={formatNumber(k?.UNFULFILLED_PO_QTY ?? 0)} sub="units still owed" />
        </div>
      </div>

      {/* ── Row 2: Ship Types + Aging + Label Donut ── */}
      <div className="grid grid-cols-12 gap-4 mb-4">
        {/* Ship Types */}
        <div className="col-span-12 sm:col-span-3 bg-white rounded-2xl p-4 shadow-sm">
          <h3 className="font-semibold text-sm text-gray-900 mb-4">By Ship Type</h3>
          <div className="space-y-3">
            {data.shipTypes.map(st => (
              <div key={st.SHIPMENTTYPE} className="bg-white rounded-xl p-4 shadow-sm border border-gray-50">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-gray-500">{st.SHIPMENTTYPE}</p>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${st.SHIPMENTTYPE === 'IMP' ? 'bg-blue-50 text-blue-700' : 'bg-green-50 text-green-700'}`}>
                    {st.SHIPMENTTYPE === 'IMP' ? 'Import' : 'Local'}
                  </span>
                </div>
                <p className="text-xl font-bold text-gray-900">{formatNumber(st.CONTAINER_COUNT)}</p>
                <p className="text-xs text-gray-400">containers</p>
                <div className="mt-2 flex justify-between text-xs text-gray-500">
                  <span>{formatNumber(st.SKU_COUNT)} SKUs</span>
                  <span>Bal: {formatNumber(st.BAL_QTY)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Aging buckets */}
        <div className="col-span-12 sm:col-span-5 bg-white rounded-2xl p-4 shadow-sm">
          <h3 className="font-semibold text-sm text-gray-900 mb-4">Stock Aging Buckets</h3>
          {data.agingBuckets.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={[...data.agingBuckets].sort((a, b) => {
                const order: Record<string, number> = { '0-30': 0, '31-60': 1, '61-90': 2, '90+': 3 }
                return (order[a.BUCKET] ?? 99) - (order[b.BUCKET] ?? 99)
              })} barSize={40}>
                <XAxis dataKey="BUCKET" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={45} tickFormatter={v => formatNumber(v)} />
                <Tooltip
                  formatter={(v: unknown, n: unknown) => [formatNumber(v as number), String(n)]}
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }}
                />
                <Bar dataKey="BAL_QTY" name="Balance Qty" radius={[4, 4, 0, 0]}>
                  {data.agingBuckets.map(b => (
                    <Cell key={b.BUCKET} fill={AGING_COLORS[b.BUCKET] ?? '#ef4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-xs text-gray-400 mt-4">No aging data</p>
          )}
          <div className="flex flex-wrap gap-3 mt-2">
            {Object.entries(AGING_COLORS).map(([k, c]) => (
              <div key={k} className="flex items-center gap-1 text-xs text-gray-500">
                <span className="w-3 h-3 rounded-sm inline-block" style={{ background: c }} />
                {k} days
              </div>
            ))}
          </div>
        </div>

        {/* Label Status donut */}
        <div className="col-span-12 sm:col-span-4 bg-white rounded-2xl p-4 shadow-sm">
          <h3 className="font-semibold text-sm text-gray-900 mb-2">Label Status</h3>
          {lb ? (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={labelDonutData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value">
                    {labelDonutData.map((_, i) => <Cell key={i} fill={LABEL_COLORS[i]} />)}
                  </Pie>
                  <Tooltip formatter={(v: unknown) => [formatNumber(v as number), '']} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-1">
                {labelDonutData.map((d, i) => (
                  <div key={d.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: LABEL_COLORS[i] }} />
                      <span className="text-gray-600">{d.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{formatNumber(d.value)}</span>
                      <span className="text-gray-400">{totalLabels ? Math.round((d.value / totalLabels) * 100) : 0}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-xs text-gray-400 mt-4">No label data</p>
          )}
        </div>
      </div>

      {/* ── Row 3: Client Receipt + Backlog ── */}
      <div className="grid grid-cols-12 gap-4 mb-4">
        {/* Client Receipt chart (RS14) */}
        {clientData.length > 0 && (
          <div className="col-span-12 sm:col-span-8 bg-white rounded-2xl p-5 shadow-sm">
            <h3 className="font-semibold text-sm text-gray-900 mb-4">Receipt by Client (Top 6)</h3>
            <div className="space-y-3">
              {clientData.map(c => {
                const max = clientData.reduce((m, x) => Math.max(m, x.RECEIPT_QTY), 0)
                return (
                  <div key={c.CLIENT}>
                    <div className="flex justify-between gap-2 text-xs mb-1">
                      <span className="font-medium text-gray-800 truncate min-w-0 flex-1">{c.CLIENT}</span>
                      <span className="text-gray-500 shrink-0 text-right">{formatNumber(c.RECEIPT_QTY)} units · {c.PONO_COUNT} POs · {c.SKU_COUNT} SKUs</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div
                        className="bg-red-500 h-2 rounded-full"
                        style={{ width: `${max ? (c.RECEIPT_QTY / max) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Backlog card */}
        {bl && (
          <div className="col-span-12 sm:col-span-4 bg-white rounded-2xl p-5 shadow-sm">
            <h3 className="font-semibold text-sm text-gray-900 mb-4 flex items-center gap-2">
              <Container className="w-4 h-4 text-red-500" /> Backlog Clearance
            </h3>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-2xl font-bold text-gray-900">{formatNumber(bl.Pending_Qty)}</p>
                <p className="text-xs text-gray-400">Pending Qty</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{formatNumber(Math.round(bl.Daily_Capacity))}</p>
                <p className="text-xs text-gray-400">Daily Capacity</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-red-500">{bl.Estimated_Days ?? '—'}</p>
                <p className="text-xs text-gray-400">Est. Days</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Row 4: Article Type Breakdown + MRP KPIs ── */}
      {articleData.length > 0 && (
        <div className="grid grid-cols-12 gap-4 mb-4">
          {/* Article type donut + legend */}
          <div className="col-span-12 sm:col-span-5 bg-white rounded-2xl p-5 shadow-sm">
            <h3 className="font-semibold text-sm text-gray-900 mb-3 flex items-center gap-2">
              <Tag className="w-4 h-4 text-red-500" /> PO Qty by Article Type
            </h3>
            <div className="flex gap-4 items-start">
              <ResponsiveContainer width={160} height={160}>
                <PieChart>
                  <Pie data={articleData} dataKey="PO_QTY" cx="50%" cy="50%" innerRadius={40} outerRadius={72} paddingAngle={2}>
                    {articleData.map((_, i) => <Cell key={i} fill={ARTICLE_COLORS[i % ARTICLE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: unknown) => [formatNumber(v as number), 'PO Qty']} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-1.5 min-w-0">
                {articleData.map((a, i) => (
                  <div key={a.ARTICLETYPE} className="flex items-center justify-between text-xs gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: ARTICLE_COLORS[i % ARTICLE_COLORS.length] }} />
                      <span className="text-gray-600 truncate">{a.ARTICLETYPE || '(none)'}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="font-medium text-gray-900">{formatNumber(a.PO_QTY)}</span>
                      <span className="text-gray-400">{totalArtQty ? Math.round((a.PO_QTY / totalArtQty) * 100) : 0}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Article type bar chart */}
          <div className="col-span-12 sm:col-span-7 bg-white rounded-2xl p-5 shadow-sm">
            <h3 className="font-semibold text-sm text-gray-900 mb-3">Article Type — SKU Count vs PO Qty</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={articleData} barSize={18} barGap={2}>
                <XAxis dataKey="ARTICLETYPE" tick={{ fontSize: 9 }} axisLine={false} tickLine={false}
                  tickFormatter={v => v?.length > 8 ? v.slice(0, 8) + '…' : v} />
                <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={50} tickFormatter={v => formatNumber(v)} />
                <Tooltip
                  formatter={(v: unknown, n: unknown) => [formatNumber(v as number), String(n)]}
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }}
                />
                <Bar dataKey="PO_QTY" name="PO Qty" fill="#ef4444" radius={[3, 3, 0, 0]} />
                <Bar dataKey="SKU_COUNT" name="SKU Count" fill="#1e1e1e" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Row 5: MRP Status strip + PO Value by Article ── */}
      <div className="grid grid-cols-12 gap-4 mb-4">
        {/* MRP Status 3-cell strip */}
        <div className="col-span-12 sm:col-span-4 bg-[#1e1e1e] rounded-2xl p-5 text-white shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-green-500/20 rounded-full blur-3xl -mr-6 -mt-6" />
          <h3 className="text-gray-400 text-xs mb-4">MRP Label Progress</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <p className="text-2xl font-bold text-green-400">{formatNumber(k?.MRP_DONE_QTY ?? 0)}</p>
              <p className="text-xs text-gray-400">Labelled</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-orange-400">{formatNumber(k?.MRP_PENDING_QTY ?? 0)}</p>
              <p className="text-xs text-gray-400">Pending</p>
            </div>
          </div>
          {(() => {
            const done = k?.MRP_DONE_QTY ?? 0
            const total = done + (k?.MRP_PENDING_QTY ?? 0)
            const pct = total ? Math.round((done / total) * 100) : 0
            return (
              <>
                <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                  <div className="h-2 rounded-full bg-green-400" style={{ width: `${pct}%` }} />
                </div>
                <p className="text-xs text-gray-400 mt-2">{pct}% complete</p>
              </>
            )
          })()}
        </div>

        {/* PO Value by Article */}
        {poValueData.length > 0 && (
          <div className="col-span-12 sm:col-span-8 bg-white rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-sm text-gray-900">PO Value by Article Type</h3>
              <span className="text-xs text-gray-400">Top {poValueData.length}</span>
            </div>
            <div className="space-y-3">
              {poValueData.map((v) => {
                const maxVal = poValueData[0].TOTAL_MRP_VALUE
                const pct = maxVal ? (v.TOTAL_MRP_VALUE / maxVal) * 100 : 0
                return (
                  <div key={v.ARTICLETYPE} className="flex items-center gap-2 sm:gap-3">
                    <span className="text-xs font-medium text-gray-700 w-16 sm:w-20 shrink-0 truncate">{v.ARTICLETYPE || '(none)'}</span>
                    <div className="flex-1 min-w-[2rem] bg-gray-100 rounded-full h-2">
                      <div className="h-2 rounded-full bg-red-500" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="text-right shrink-0 w-20 sm:w-36">
                      <span className="text-xs font-semibold text-gray-900">₹{formatNumber(Math.round(v.TOTAL_MRP_VALUE / 1000))}K</span>
                      <span className="hidden sm:inline text-xs text-gray-400 ml-1.5">avg ₹{formatNumber(Math.round(v.AVG_MRP))}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
