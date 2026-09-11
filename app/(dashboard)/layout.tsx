import { redirect } from 'next/navigation'
import { DashboardProvider } from '@/context/DashboardContext'
import DashboardShell from '@/components/layout/DashboardShell'
import ScrollContext from '@/components/layout/ScrollContext'
import AccountBlocked from '@/components/auth/AccountBlocked'
import { getCurrentUser, getSession } from '@/lib/auth/session'
import type { SessionUser } from '@/types/auth'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // proxy.ts already turns anonymous visitors away; this guards the render too
  const session = await getSession()
  if (!session) redirect('/login')

  // Fresh DB read so a disabled account is shut out and role changes show up.
  // If the DB is unreachable, fall back to the cookie — the API routes still
  // run their own check before serving any data.
  let user: SessionUser | null = session
  try {
    user = await getCurrentUser()
  } catch (err) {
    console.error('[dashboard layout] account lookup failed', err)
  }
  if (!user) return <AccountBlocked name={session.name} />

  return (
    <ScrollContext>
      <DashboardProvider>
        <DashboardShell user={user}>{children}</DashboardShell>
      </DashboardProvider>
    </ScrollContext>
  )
}
