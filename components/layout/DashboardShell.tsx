"use client";

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Sidebar from './Sidebar'
import { SidebarProvider } from './SidebarContext'

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const [prevPath, setPrevPath] = useState(pathname)

  // Auto-close drawer on navigation (back/forward too) — adjust state during render
  if (pathname !== prevPath) {
    setPrevPath(pathname)
    setOpen(false)
  }

  // Lock background scroll while the mobile drawer is open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  return (
    <SidebarProvider value={{ openSidebar: () => setOpen(true) }}>
      <div className="flex min-h-screen bg-[#f4f2f2] font-sans text-gray-800 lg:p-4 lg:gap-6">
        <Sidebar open={open} onClose={() => setOpen(false)} />
        <main className="flex-1 min-w-0 flex flex-col p-4 lg:p-0">
          {children}
        </main>
      </div>
    </SidebarProvider>
  )
}
