'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Server } from 'lucide-react'
import { getReadClient } from '@/lib/read-client'
import { NodeHealth } from '@/lib/types'
import { StatusPill } from '@/components/StatusPill'

const CLINICAL_ORG = 'coordinador-nacional' as const

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [health, setHealth] = useState<NodeHealth | null>(null)
  const [healthError, setHealthError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const client = getReadClient(CLINICAL_ORG)
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
  }, [])

  const nav = [
    { href: '/dashboard', label: 'Tablero' },
    { href: '/dashboard/casos', label: 'Consultar caso' },
    { href: '/dashboard/estadisticas', label: 'Estadísticas' },
  ]

  const replicaOk = Boolean(health && health.status === 'ok' && !healthError)

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card">
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
            <StatusPill tone="neutral">Solo lectura</StatusPill>
            <span
              className={`h-2.5 w-2.5 rounded-full ${replicaOk ? 'bg-teal-600' : 'bg-red-500'}`}
              title={replicaOk ? 'Nodo de consulta en línea' : 'Nodo de consulta sin respuesta'}
              aria-label={replicaOk ? 'Nodo de consulta en línea' : 'Nodo de consulta sin respuesta'}
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
        {healthError && (
          <div className="mx-auto max-w-6xl px-4 pb-3">
            <Link href="/infra" className="text-sm text-destructive underline-offset-2 hover:underline">
              El nodo de consulta no responde
            </Link>
          </div>
        )}
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  )
}
