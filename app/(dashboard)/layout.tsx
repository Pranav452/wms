import { DashboardProvider } from '@/context/DashboardContext'
import DashboardShell from '@/components/layout/DashboardShell'
import ScrollContext from '@/components/layout/ScrollContext'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ScrollContext>
      <DashboardProvider>
        <DashboardShell>{children}</DashboardShell>
      </DashboardProvider>
    </ScrollContext>
  )
}
