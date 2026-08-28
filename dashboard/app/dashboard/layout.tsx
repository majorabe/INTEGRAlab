import { RoleProvider } from '@/lib/role-context'
import { DashboardShell } from '@/components/DashboardShell'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleProvider>
      <DashboardShell>{children}</DashboardShell>
    </RoleProvider>
  )
}
