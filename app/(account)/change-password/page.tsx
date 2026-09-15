import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getCurrentAccount, getSession } from '@/lib/auth/session'
import ChangePasswordForm from '@/components/auth/ChangePasswordForm'

export const metadata: Metadata = { title: 'Change password · Bridge WMS' }

export default async function ChangePasswordPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  // Tailor the copy to a forced reset vs. a voluntary change. If the DB is
  // unreachable we just treat it as voluntary — the action re-checks on submit.
  let mustChange = false
  try {
    mustChange = (await getCurrentAccount())?.MUST_CHANGE_PW ?? false
  } catch {
    /* DB down — leave as voluntary; submit will surface the real error */
  }

  return <ChangePasswordForm mustChange={mustChange} />
}
