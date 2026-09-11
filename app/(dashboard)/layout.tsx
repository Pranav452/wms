import { redirect } from 'next/navigation'
import { DashboardProvider } from '@/context/DashboardContext'
import DashboardShell from '@/components/layout/DashboardShell'
import ScrollContext from '@/components/layout/ScrollContext'
import { getSession } from '@/lib/auth/session'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // proxy.ts already turns anonymous visitors away; this guards the render too
  const user = await getSession()
  if (!user) redirect('/login')

  return (
    <ScrollContext>
      <DashboardProvider>
        <DashboardShell user={user}>{children}</DashboardShell>
      </DashboardProvider>
    </ScrollContext>
  )
}
