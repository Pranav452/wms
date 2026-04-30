"use client";

import { RefreshCw } from 'lucide-react'
import { useDashboard } from '@/context/DashboardContext'

function formatDisplayDate(ymd: string): string {
  if (!ymd) return ''
  const [y, m, d] = ymd.split('-')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${parseInt(d)} ${months[parseInt(m) - 1]} ${y}`
}

interface HeaderProps {
  title: string
  breadcrumb: string
}

export default function Header({ title, breadcrumb }: HeaderProps) {
  const { asOnDate, setAsOnDate, refresh, loading } = useDashboard()

  return (
    <header className="flex justify-between items-center mb-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Dashboard / <span className="text-red-500">{breadcrumb}</span>
        </p>
      </div>

      <div className="flex items-center gap-3">
        {/* As-on-date picker */}
        <div className="flex items-center gap-2 bg-white rounded-xl px-3 py-2 shadow-sm border border-gray-100">
          <span className="text-xs text-gray-500 hidden sm:block">As on:</span>
          <input
            type="date"
            value={asOnDate}
            onChange={e => setAsOnDate(e.target.value)}
            className="text-sm text-gray-800 outline-none bg-transparent cursor-pointer"
          />
        </div>

        {/* Refresh */}
        <button
          onClick={refresh}
          disabled={loading}
          className="flex items-center gap-1.5 bg-white rounded-xl px-3 py-2 shadow-sm border border-gray-100 text-sm text-gray-600 hover:text-red-500 hover:border-red-200 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-red-500' : ''}`} />
          <span className="hidden sm:block">{loading ? 'Loading…' : 'Refresh'}</span>
        </button>

        {/* Display date pill */}
        <span className="hidden md:block text-xs bg-red-50 text-red-600 px-3 py-1.5 rounded-full font-medium">
          {formatDisplayDate(asOnDate)}
        </span>
      </div>
    </header>
  )
}
