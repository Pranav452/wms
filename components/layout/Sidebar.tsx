"use client";

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Box,
  Ship,
  Truck,
  TrendingUp,
  Tag,
  FileText,
  Settings,
  Warehouse,
} from 'lucide-react'

const NAV_ITEMS = [
  { href: '/overview',    icon: LayoutDashboard, label: 'Overview' },
  { href: '/stock',       icon: Box,             label: 'Stock Detail' },
  { href: '/containers',  icon: Ship,            label: 'Containers' },
  { href: '/dispatch',    icon: Truck,           label: 'Dispatch' },
  { href: '/grn',         icon: TrendingUp,      label: 'GRN & Trends' },
  { href: '/mrp',         icon: Tag,             label: 'MRP / Labels' },
  { href: '/po',          icon: FileText,        label: 'PO Tracking' },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-[240px] bg-white rounded-3xl flex flex-col justify-between py-6 px-4 shadow-sm h-[calc(100vh-32px)] sticky top-4 overflow-y-auto flex-shrink-0">
      <div>
        {/* Logo */}
        <div className="flex items-center gap-2 px-2 mb-8 text-red-500 font-bold text-lg tracking-tight">
          <div className="w-6 h-6 bg-red-500 rounded-md transform rotate-45 flex items-center justify-center">
            <div className="w-3 h-3 bg-white rounded-sm transform -rotate-45" />
          </div>
          <Warehouse className="w-5 h-5 text-red-500" />
          <span>Seaport WMS</span>
        </div>

        {/* User stub */}
        <div className="flex items-center gap-3 bg-gray-50 p-2 rounded-xl mb-8 border border-gray-100">
          <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center text-red-600 font-bold text-sm flex-shrink-0">
            SL
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">Seaport Logistics</p>
            <p className="text-xs text-gray-500">Mumbai · Admin</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="space-y-0.5">
          {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
            const active = pathname === href || pathname.startsWith(href + '/')
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm ${
                  active
                    ? 'bg-red-50 text-red-500 font-medium'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <Icon className={`w-5 h-5 flex-shrink-0 ${active ? 'text-red-500' : 'text-gray-400'}`} />
                {label}
              </Link>
            )
          })}
        </nav>
      </div>

      <div>
        <div className="border-t pt-4 space-y-0.5">
          <Link href="/settings" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-colors">
            <Settings className="w-5 h-5 text-gray-400" />
            Settings
          </Link>
        </div>

        {/* Info card */}
        <div className="bg-[#1e1e1e] rounded-2xl p-4 text-white mt-4 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-red-500/20 rounded-full blur-2xl -mr-8 -mt-8" />
          <h3 className="font-bold text-sm mb-1 relative z-10 leading-tight">Seaport Logistics<br />Mumbai</h3>
          <p className="text-xs text-gray-400 relative z-10">WMS Stock-Status Dashboard</p>
        </div>
      </div>
    </aside>
  )
}
