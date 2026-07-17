"use client";

import Header from '@/components/layout/Header'
import { useDashboard } from '@/context/DashboardContext'
import { FLOORS, RACKS, TOTAL_SHELVES, TOTAL_LOCATIONS, floorTotals } from '@/lib/racks'
import { formatNumber } from '@/lib/utils'
import {
  CalendarRange,
  Warehouse,
  RefreshCw,
  Info,
  LifeBuoy,
  ShieldCheck,
} from 'lucide-react'

function SettingCard({ icon: Icon, title, children }: {
  icon: typeof Info
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-8 h-8 rounded-xl bg-red-50 text-red-500 flex items-center justify-center flex-shrink-0">
          <Icon className="w-4 h-4" />
        </div>
        <h2 className="text-sm font-bold text-gray-900">{title}</h2>
      </div>
      <div className="text-sm text-gray-600 space-y-2">{children}</div>
    </section>
  )
}

function FactRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-400">{k}</span>
      <span className="text-sm text-gray-800 font-medium text-right">{v}</span>
    </div>
  )
}

export default function SettingsPage() {
  const { asOnDate, fromDate, loading, refresh } = useDashboard()

  return (
    <>
      <Header title="Settings" breadcrumb="Settings" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SettingCard icon={Info} title="About Bridge WMS">
          <p>
            Stock-status dashboard for the Seaport Logistics warehouse, Mumbai. It reads
            directly from the ERP database and presents warehouse stock, rack occupancy,
            containers, dispatch, GRN, PO, MRP and RTV in one place.
          </p>
          <p className="text-xs text-gray-400">
            This dashboard is read-only — it never writes to the ERP. All figures are
            computed live from ERP transactions at the time of loading.
          </p>
        </SettingCard>

        <SettingCard icon={CalendarRange} title="Date range & refresh">
          <p>
            The <b className="text-gray-800">From / To</b> pickers in the page header set the
            reporting window for movement figures (GRN, dispatch, trends). Clearing the
            start date switches to all-time. The <b className="text-gray-800">To</b> date is
            also the &ldquo;as-on&rdquo; date for stock balances.
          </p>
          <FactRow k="Current window" v={fromDate ? `${fromDate} → ${asOnDate}` : `All-time → ${asOnDate}`} />
          <button
            onClick={refresh}
            disabled={loading}
            className="mt-2 inline-flex items-center gap-1.5 text-sm text-red-500 font-medium hover:underline disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Refreshing…' : 'Refresh all data now'}
          </button>
        </SettingCard>

        <SettingCard icon={Warehouse} title="Warehouse layout">
          <FactRow k="Racks" v={`${RACKS.length}`} />
          <FactRow k="Floors" v={FLOORS.map(f => f.label).join(' · ')} />
          {FLOORS.map(f => {
            const t = floorTotals(f.id)
            return (
              <FactRow
                key={f.id}
                k={`${f.label} (${f.short})`}
                v={`${t.racks} racks · ${formatNumber(t.shelves)} shelves · ${formatNumber(t.locations)} bins`}
              />
            )
          })}
          <FactRow k="Total capacity" v={`${formatNumber(TOTAL_SHELVES)} shelves · ${formatNumber(TOTAL_LOCATIONS)} bins`} />
          <p className="text-xs text-gray-400 pt-1">
            Bin codes follow rack + shelf + position (e.g. A07B, GC12A). Pallet, cage and
            room zones sit outside the rack grids — see Rack Management → Other storage.
          </p>
        </SettingCard>

        <SettingCard icon={ShieldCheck} title="Preferences">
          <p>
            There are no user-configurable preferences yet. Theme, saved filters and
            per-user defaults are planned — tell us what you need first.
          </p>
        </SettingCard>

        <SettingCard icon={LifeBuoy} title="Support">
          <p>
            Numbers looking wrong, a feed failing, or a feature missing? Contact the
            system administrator with the page name and the date range you were viewing —
            a screenshot helps.
          </p>
        </SettingCard>
      </div>
    </>
  )
}
