'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Activity, Server } from 'lucide-react'
import { useRole } from '@/lib/role-context'
import { ROLE_CONFIGS, getAvailableRoles } from '@/lib/roles'
import { getReadClient } from '@/lib/read-client'
import { NodeHealth, RoleType } from '@/lib/types'
import { StatusPill } from '@/components/StatusPill'

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { role, setRole } = useRole()
  const pathname = usePathname()
  const config = ROLE_CONFIGS[role]
  const [health, setHealth] = useState<NodeHealth | null>(null)
  const [healthError, setHealthError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const client = getReadClient(role)
    client
      .getNodeHealth()
      .then((h) => {
        if (!cancelled) {
          setHealth(h)
          setHealthError(null)
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setHealth(null)
          setHealthError(err.message)
        }
      })
    return () => {
      cancelled = true
    }
  }, [role])

  const nav = [
    { href: '/dashboard', label: 'Tablero' },
    { href: '/dashboard/casos', label: 'Consultar caso' },
    { href: '/dashboard/estadisticas', label: 'Estadísticas' },
  ]

  const replicaOk = Boolean(health && health.status === 'ok' && !healthError)

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card">
        <div className={`h-1.5 ${config.color}`} aria-hidden />
        <div className="mx-auto max-w-6xl px-4 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-8">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">INTEGRA · consulta clínica</p>
              <p className="text-lg font-semibold leading-tight">Donantes y traslados</p>
            </div>
            <nav className="flex gap-1">
              {nav.map((item) => {
                const active =
                  item.href === '/dashboard'
                    ? pathname === '/dashboard'
                    : pathname.startsWith(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`rounded-md px-3 py-2 text-base ${
                      active
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    }`}
                  >
                    {item.label}
                  </Link>
                )
              })}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="whitespace-nowrap">Organización</span>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as RoleType)}
                aria-label="Organización desde la que se consulta"
                className="h-10 min-w-[13rem] rounded-md border border-input bg-background px-2 text-base text-foreground"
              >
                {getAvailableRoles().map((id) => (
                  <option key={id} value={id}>
                    {ROLE_CONFIGS[id].name}
                  </option>
                ))}
              </select>
            </label>
            <span
              className={`h-2.5 w-2.5 rounded-full ${replicaOk ? 'bg-teal-600' : 'bg-red-500'}`}
              title={replicaOk ? 'Réplica en línea' : 'Réplica sin respuesta'}
              aria-label={replicaOk ? 'Réplica en línea' : 'Réplica sin respuesta'}
            />
            <Link
              href="/infra"
              className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              title="Salud de los nodos y consistencia del ledger"
            >
              <Server className="h-4 w-4" />
              Red
            </Link>
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-4 pb-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Activity className="h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="text-sm">
              <span className="font-semibold">{config.name}</span>
              <span className="text-muted-foreground"> · {config.description}</span>
            </p>
          </div>
          {healthError ? (
            <Link href="/infra" className="text-sm text-destructive underline-offset-2 hover:underline">
              Esta organización no responde
            </Link>
          ) : (
            <StatusPill tone="neutral">Solo lectura</StatusPill>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  )
}
