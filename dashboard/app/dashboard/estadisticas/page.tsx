'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRole } from '@/lib/role-context'
import { getReadClient } from '@/lib/read-client'

interface LedgerStats {
  totalBlocks: number
  totalTransactions: number
  txByType: Record<string, number>
  recentTx: Array<{ type: string; timestamp: string; blockIndex: number }>
  lastUpdate: string
  error: string | null
}

export default function EstadisticasPage() {
  const { role } = useRole()
  const [stats, setStats] = useState<LedgerStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const fetchStats = async () => {
      try {
        const client = getReadClient(role)
        const health = await client.getNodeHealth()

        const stats: LedgerStats = {
          totalBlocks: health.length ?? 0,
          totalTransactions: health.totalTransactions ?? 0,
          txByType: health.txByType ?? {},
          recentTx: health.recentTransactions ?? [],
          lastUpdate: new Date().toLocaleTimeString('es-AR'),
          error: null,
        }

        if (!cancelled) {
          setStats(stats)
        }
      } catch (err) {
        if (!cancelled) {
          setStats({
            totalBlocks: 0,
            totalTransactions: 0,
            txByType: {},
            recentTx: [],
            lastUpdate: new Date().toLocaleTimeString('es-AR'),
            error: err instanceof Error ? err.message : String(err),
          })
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void fetchStats()
    const interval = setInterval(() => void fetchStats(), 5000)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [role])

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Estadísticas del ledger</h1>
        <p className="text-sm text-muted-foreground">Cargando...</p>
      </div>
    )
  }

  if (stats?.error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">Estadísticas del ledger</h1>
          <Link
            href="/dashboard"
            className="text-xs px-3 py-1 rounded-md border border-input hover:bg-accent"
          >
            ← Volver
          </Link>
        </div>
        <div className="rounded-lg border border-destructive/30 bg-card p-4">
          <p className="text-sm font-medium text-destructive">Error cargando estadísticas</p>
          <p className="text-sm text-muted-foreground mt-1">{stats.error}</p>
        </div>
      </div>
    )
  }

  if (!stats) {
    return null
  }

  const txTypes = Object.entries(stats.txByType).map(([type, count]) => ({
    type,
    count,
    percentage: stats.totalTransactions > 0 ? ((count / stats.totalTransactions) * 100).toFixed(1) : '0',
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Estadísticas del ledger</h1>
        <div className="text-xs text-muted-foreground">
          Actualizado {stats.lastUpdate}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Bloques totales</p>
          <p className="text-3xl font-bold mt-2">{stats.totalBlocks}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Transacciones</p>
          <p className="text-3xl font-bold mt-2">{stats.totalTransactions}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Tx por bloque</p>
          <p className="text-3xl font-bold mt-2">
            {stats.totalBlocks > 0 ? (stats.totalTransactions / stats.totalBlocks).toFixed(1) : '0'}
          </p>
        </div>
      </div>

      {txTypes.length > 0 && (
        <div className="rounded-lg border bg-card p-4">
          <h2 className="text-lg font-semibold tracking-tight mb-4">Transacciones por tipo</h2>
          <div className="space-y-3">
            {txTypes.map(({ type, count, percentage }) => (
              <div key={type} className="space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{type}</p>
                  <p className="text-sm text-muted-foreground">
                    {count} ({percentage}%)
                  </p>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {stats.recentTx.length > 0 && (
        <div className="rounded-lg border bg-card p-4">
          <h2 className="text-lg font-semibold tracking-tight mb-4">Últimas transacciones</h2>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {stats.recentTx.slice(0, 10).map((tx, i) => (
              <div key={i} className="flex items-center justify-between text-sm p-2 rounded hover:bg-muted">
                <span className="font-mono text-xs text-muted-foreground">#{tx.blockIndex}</span>
                <span className="font-medium">{tx.type}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(tx.timestamp).toLocaleTimeString('es-AR')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
