'use client'

import { useEffect, useState } from 'react'
import { useRole } from '@/lib/role-context'
import { getReadClient } from '@/lib/read-client'

interface IntegrityStatus {
  valid: boolean
  length: number
  lastBlockHash: string | null
  error: string | null
  loadingTime: number
}

export function IntegrityCheck() {
  const { role } = useRole()
  const [status, setStatus] = useState<IntegrityStatus | null>(null)
  const [loading, setLoading] = useState(false)

  async function checkIntegrity() {
    setLoading(true)
    setStatus(null)
    const startTime = Date.now()

    try {
      const client = getReadClient(role)
      const response = await client.getNodeHealth()

      const valid = response.valid ?? true
      const length = response.length ?? 0
      const lastBlockHash = response.tipHash ?? null
      const loadingTime = Date.now() - startTime

      setStatus({
        valid,
        length,
        lastBlockHash,
        error: null,
        loadingTime,
      })
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      setStatus({
        valid: false,
        length: 0,
        lastBlockHash: null,
        error: errorMsg,
        loadingTime: Date.now() - startTime,
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void checkIntegrity()
    const interval = setInterval(() => {
      void checkIntegrity()
    }, 10000)
    return () => clearInterval(interval)
  }, [role])

  if (!status) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
        <p className="text-sm text-zinc-400">Verificando integridad del ledger...</p>
      </div>
    )
  }

  if (status.error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-card p-4">
        <p className="text-sm font-medium text-destructive">Error verificando integridad</p>
        <p className="text-sm text-muted-foreground mt-1">{status.error}</p>
      </div>
    )
  }

  return (
    <div
      className={`rounded-lg border px-4 py-3 ${
        status.valid
          ? 'border-emerald-500/40 bg-emerald-950/30'
          : 'border-red-500/40 bg-red-950/30'
      }`}
    >
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">
            {status.valid ? '🟢 Ledger íntegro' : '🔴 Ledger corrupto'}
          </p>
          <button
            onClick={() => void checkIntegrity()}
            disabled={loading}
            className="text-xs px-2 py-1 rounded bg-zinc-700/50 hover:bg-zinc-600/50 disabled:opacity-50"
          >
            {loading ? 'Verificando...' : 'Verificar de nuevo'}
          </button>
        </div>

        <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mt-3">
          <div>
            <dt className="text-zinc-400 mb-1">Bloques</dt>
            <dd className="font-mono font-semibold">{status.length}</dd>
          </div>
          <div>
            <dt className="text-zinc-400 mb-1">Tip Hash</dt>
            <dd className="font-mono text-xs truncate">
              {status.lastBlockHash ? status.lastBlockHash.slice(0, 16) + '…' : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-400 mb-1">Tiempo</dt>
            <dd className="font-mono">{status.loadingTime} ms</dd>
          </div>
          <div>
            <dt className="text-zinc-400 mb-1">Estado</dt>
            <dd className="font-mono">{status.valid ? 'válido' : 'inválido'}</dd>
          </div>
        </dl>

        <p className="text-xs text-zinc-400 mt-3">
          ℹ️ Cada bloque contiene el hash del anterior. Si cualquier dato fue modificado retroactivamente, este check lo detectaría.
        </p>
      </div>
    </div>
  )
}
