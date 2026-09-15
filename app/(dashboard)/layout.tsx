import { redirect } from 'next/navigation'
import { DashboardProvider } from '@/context/DashboardContext'
import DashboardShell from '@/components/layout/DashboardShell'
import ScrollContext from '@/components/layout/ScrollContext'
import AccountBlocked from '@/components/auth/AccountBlocked'
import { getCurrentAccount, getSession } from '@/lib/auth/session'
import type { SessionUser } from '@/types/auth'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // proxy.ts already turns anonymous visitors away; this guards the render too
  const session = await getSession()
  if (!session) redirect('/login')

  // Fresh DB read so a disabled account is shut out, role changes show up, and
  // an admin's password reset forces a change. If the DB is unreachable, fall
  // back to the cookie — the API routes still run their own check before
  // serving any data.
  let user: SessionUser | null = session
  let mustChange = false
  let blocked = false
  try {
    const account = await getCurrentAccount()
    if (!account) {
      blocked = true
    } else {
      user = { id: account.ID, username: account.USERNAME, name: account.FULLNAME, role: account.ROLE }
      mustChange = account.MUST_CHANGE_PW
    }
  } catch (err) {
    console.error('[dashboard layout] account lookup failed', err)
  }

  // returning JSX / calling redirect() must sit outside the try/catch above
  if (blocked) return <AccountBlocked name={session.name} />
  if (mustChange) redirect('/change-password')

  return (
    <ScrollContext>
      <DashboardProvider>
        <DashboardShell user={user}>{children}</DashboardShell>
      </DashboardProvider>
    </ScrollContext>
  )
}
