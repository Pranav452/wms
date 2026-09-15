"use client";

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Sidebar from './Sidebar'
import { SidebarProvider } from './SidebarContext'
import { UserProvider } from './UserContext'
import { trackPageView } from '@/lib/track'
import type { SessionUser } from '@/types/auth'

export default function DashboardShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
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

  // Page visits for the admin Activity page (repeat visits within a few minutes count once)
  useEffect(() => { trackPageView(pathname) }, [pathname])

  return (
    <UserProvider value={user}>
      <SidebarProvider value={{ openSidebar: () => setOpen(true) }}>
        <div className="flex min-h-screen bg-[#f4f2f2] font-sans text-gray-800 lg:p-4 lg:gap-6">
          <Sidebar open={open} onClose={() => setOpen(false)} user={user} />
          <main className="flex-1 min-w-0 flex flex-col p-4 lg:p-0">
            {children}
          </main>
        </div>
      </SidebarProvider>
    </UserProvider>
  )
}
