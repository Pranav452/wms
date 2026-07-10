"use client";

import { RefreshCw, Menu } from 'lucide-react'
import { useDashboard } from '@/context/DashboardContext'
import { useSidebar } from './SidebarContext'

function formatDisplayDate(ymd: string): string {
  if (!ymd) return ''
  const [y, m, d] = ymd.split('-')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${parseInt(d)} ${months[parseInt(m) - 1]} ${y}`
}

function formatRange(from: string, to: string): string {
  return from ? `${formatDisplayDate(from)} – ${formatDisplayDate(to)}` : formatDisplayDate(to)
}

interface HeaderProps {
  title: string
  breadcrumb: string
}

export default function Header({ title, breadcrumb }: HeaderProps) {
  const { asOnDate, setAsOnDate, fromDate, setFromDate, refresh, loading } = useDashboard()
  const { openSidebar } = useSidebar()

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 mb-6">
      <div className="flex items-center gap-3 min-w-0">
        {/* Mobile hamburger */}
        <button
          onClick={openSidebar}
          aria-label="Open menu"
          className="lg:hidden flex items-center justify-center w-11 h-11 rounded-xl bg-white shadow-sm border border-gray-100 text-gray-600 hover:text-red-500 transition-colors flex-shrink-0"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">{title}</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Dashboard / <span className="text-red-500">{breadcrumb}</span>
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
        {/* Date-range picker — start optional ('' = all-time), end doubles as the as-on date */}
        <div className="flex items-center gap-2 bg-white rounded-xl px-3 py-2 shadow-sm border border-gray-100">
          <span className="text-xs text-gray-500 hidden sm:block">From:</span>
          <input
            type="date"
            value={fromDate}
            max={asOnDate}
            onChange={e => setFromDate(e.target.value)}
            className="text-sm text-gray-800 outline-none bg-transparent cursor-pointer min-w-0 w-[7.5rem] sm:w-auto"
          />
          {fromDate && (
            <button
              onClick={() => setFromDate('')}
              aria-label="Clear start date"
              className="text-gray-400 hover:text-red-500 text-xs font-medium"
            >
              ✕
            </button>
          )}
          <span className="text-xs text-gray-500 hidden sm:block">To:</span>
          <input
            type="date"
            value={asOnDate}
            onChange={e => setAsOnDate(e.target.value)}
            className="text-sm text-gray-800 outline-none bg-transparent cursor-pointer min-w-0 w-[7.5rem] sm:w-auto"
          />
        </div>

        {/* Refresh */}
        <button
          onClick={refresh}
          disabled={loading}
          aria-label="Refresh data"
          className="flex items-center justify-center gap-1.5 bg-white rounded-xl px-3 h-11 sm:h-auto sm:py-2 shadow-sm border border-gray-100 text-sm text-gray-600 hover:text-red-500 hover:border-red-200 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-red-500' : ''}`} />
          <span className="hidden sm:block">{loading ? 'Loading…' : 'Refresh'}</span>
        </button>

        {/* Display date pill */}
        <span className="hidden md:block text-xs bg-red-50 text-red-600 px-3 py-1.5 rounded-full font-medium">
          {formatRange(fromDate, asOnDate)}
        </span>
      </div>
    </header>
  )
}
