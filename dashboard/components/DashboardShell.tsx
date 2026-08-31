'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useRole } from '@/lib/role-context'
import { ROLE_CONFIGS, getAvailableRoles, NODE_URLS } from '@/lib/roles'
import { getReadClient } from '@/lib/read-client'
import { NodeHealth, RoleType } from '@/lib/types'

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
    { href: '/dashboard', label: 'Inicio' },
    { href: '/dashboard/casos', label: 'Consultar caso' },
    { href: '/dashboard/estadisticas', label: 'Estadísticas' },
  ]

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card">
        <div className="mx-auto max-w-6xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-6">
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">INTEGRA · consulta</p>
              <p className="text-sm font-semibold">Dashboard clínico</p>
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
                    className={`rounded-md px-3 py-1.5 text-sm ${
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
            <label className="text-xs text-muted-foreground">
              Leer desde
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as RoleType)}
                className="ml-2 h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
              >
                {getAvailableRoles().map((id) => (
                  <option key={id} value={id}>
                    {ROLE_CONFIGS[id].name}
                  </option>
                ))}
              </select>
            </label>
            <Link
              href="/infra"
              className="text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
            >
              Infra
            </Link>
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-4 pb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>{config.description}</span>
          <span className="font-mono">{NODE_URLS[role].replace('http://', '')}</span>
          {health && (
            <span className="font-tabular">
              {health.org} · {health.ledgerBlocks} bloques · {health.status}
            </span>
          )}
          {healthError && (
            <span className="text-destructive">
              Nodo no responde.{' '}
              <Link href="/infra" className="underline">
                Ver infra
              </Link>
            </span>
          )}
          <span className="ml-auto rounded-full bg-accent px-2 py-0.5 text-accent-foreground">
            solo lectura
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  )
}
