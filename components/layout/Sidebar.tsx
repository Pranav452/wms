"use client";

import React, { useState, useEffect } from 'react'
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
  Boxes,
  ChevronDown,
  RotateCcw,
  X,
} from 'lucide-react'

interface NavLeaf {
  href: string
  icon?: typeof Box
  label: string
}
interface NavGroupItem {
  icon: typeof Box
  label: string
  children: NavLeaf[]
}
type NavEntry = NavLeaf | NavGroupItem

const NAV_ITEMS: NavEntry[] = [
  { href: '/overview',   icon: LayoutDashboard, label: 'Overview' },
  { href: '/stock',      icon: Box,             label: 'Stock Detail' },
  { href: '/racks',      icon: Boxes,           label: 'Rack Management' },
  { href: '/containers', icon: Ship,       label: 'Containers' },
  { href: '/dispatch',   icon: Truck,      label: 'Dispatch' },
  { href: '/grn',        icon: TrendingUp, label: 'GRN & Trends' },
  { href: '/mrp',        icon: Tag,        label: 'MRP / Labels' },
  { href: '/po',         icon: FileText,   label: 'PO Tracking' },
  { href: '/rtv',        icon: RotateCcw,  label: 'RTV Returns' },
]

function isGroup(e: NavEntry): e is NavGroupItem {
  return (e as NavGroupItem).children !== undefined
}

interface SidebarProps {
  open: boolean
  onClose: () => void
}

function NavLink({ href, label, icon: Icon, onClose }: NavLeaf & { onClose: () => void }) {
  const pathname = usePathname()
  const active = pathname === href || pathname.startsWith(href + '/')
  return (
    <Link
      href={href}
      onClick={onClose}
      className={`flex items-center gap-3 px-3 py-3 lg:py-2.5 rounded-lg transition-colors text-sm ${
        active ? 'bg-red-50 text-red-500 font-medium' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
      }`}
    >
      {Icon && <Icon className={`w-5 h-5 flex-shrink-0 ${active ? 'text-red-500' : 'text-gray-400'}`} />}
      {label}
    </Link>
  )
}

function NavGroup({ item, onClose }: { item: NavGroupItem; onClose: () => void }) {
  const pathname = usePathname()
  const childActive = item.children.some(c => pathname === c.href || pathname.startsWith(c.href + '/'))
  const [open, setOpen] = useState(childActive)
  useEffect(() => { if (childActive) setOpen(true) }, [childActive])

  const Icon = item.icon
  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center gap-3 px-3 py-3 lg:py-2.5 rounded-lg transition-colors text-sm ${
          childActive ? 'text-red-500 font-medium' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
        }`}
      >
        <Icon className={`w-5 h-5 flex-shrink-0 ${childActive ? 'text-red-500' : 'text-gray-400'}`} />
        <span className="flex-1 text-left">{item.label}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-0.5 ml-4 pl-3 border-l border-gray-100 space-y-0.5">
          {item.children.map(c => {
            const active = pathname === c.href || pathname.startsWith(c.href + '/')
            return (
              <Link
                key={c.href}
                href={c.href}
                onClick={onClose}
                className={`block px-3 py-2.5 lg:py-2 rounded-lg text-sm transition-colors ${
                  active ? 'bg-red-50 text-red-500 font-medium' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                {c.label}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  return (
    <>
      {/* Backdrop — mobile only */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity duration-300 lg:hidden ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />

      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-[260px] max-w-[82vw] bg-white flex flex-col justify-between
          py-6 px-4 shadow-2xl overflow-y-auto transition-transform duration-300 ease-out flex-shrink-0
          ${open ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0 lg:static lg:z-auto lg:w-[240px] lg:max-w-none lg:shadow-sm
          lg:h-[calc(100vh-32px)] lg:sticky lg:top-4 lg:rounded-3xl
        `}
      >
        <div>
          {/* Logo + mobile close */}
          <div className="flex items-center justify-between gap-2 px-2 mb-8">
            <div className="flex items-center gap-2 text-red-500 font-bold text-lg tracking-tight min-w-0">
              <div className="w-6 h-6 bg-red-500 rounded-md transform rotate-45 flex items-center justify-center flex-shrink-0">
                <div className="w-3 h-3 bg-white rounded-sm transform -rotate-45" />
              </div>
              <Warehouse className="w-5 h-5 text-red-500 flex-shrink-0" />
              <span className="truncate">Bridge WMS</span>
            </div>
            <button
              onClick={onClose}
              aria-label="Close menu"
              className="lg:hidden flex items-center justify-center w-9 h-9 -mr-1 rounded-lg text-gray-400 hover:bg-gray-50 hover:text-gray-700 transition-colors flex-shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* User stub */}
          <div className="flex items-center gap-3 bg-gray-50 p-2 rounded-xl mb-8 border border-gray-100">
            <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center text-red-600 font-bold text-sm flex-shrink-0">
              BW
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">Bridge WMS</p>
              <p className="text-xs text-gray-500">Admin</p>
            </div>
          </div>

          {/* Navigation */}
          <nav className="space-y-0.5">
            {NAV_ITEMS.map(entry =>
              isGroup(entry) ? (
                <NavGroup key={entry.label} item={entry} onClose={onClose} />
              ) : (
                <NavLink key={entry.href} {...entry} onClose={onClose} />
              ),
            )}
          </nav>
        </div>

        <div>
          <div className="border-t pt-4 space-y-0.5">
            <Link
              href="/settings"
              onClick={onClose}
              className="flex items-center gap-3 px-3 py-3 lg:py-2.5 rounded-lg text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-colors"
            >
              <Settings className="w-5 h-5 text-gray-400" />
              Settings
            </Link>
          </div>

          {/* Info card */}
          <div className="bg-[#1e1e1e] rounded-2xl p-4 text-white mt-4 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-20 h-20 bg-red-500/20 rounded-full blur-2xl -mr-8 -mt-8" />
            <h3 className="font-bold text-sm mb-1 relative z-10 leading-tight">Bridge WMS</h3>
            <p className="text-xs text-gray-400 relative z-10">Stock-Status Dashboard</p>
          </div>
        </div>
      </aside>
    </>
  )
}
