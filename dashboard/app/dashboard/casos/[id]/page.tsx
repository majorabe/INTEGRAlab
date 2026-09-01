'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useRole } from '@/lib/role-context'
import { caseFocusForRole, ROLE_CONFIGS } from '@/lib/roles'
import { getReadClient } from '@/lib/read-client'
import { CaseResponse } from '@/lib/types'
import { CaseDetail } from '@/components/CaseDetail'
import { Timeline } from '@/components/Timeline'
import { TelemetryChart } from '@/components/TelemetryChart'
import { CaseLifecycle } from '@/components/CaseLifecycle'

const RECENT_KEY = 'integra-recent-cases'

function rememberCase(id: string) {
  try {
    const prev = JSON.parse(sessionStorage.getItem(RECENT_KEY) || '[]') as string[]
    const next = [id, ...prev.filter((x) => x !== id)].slice(0, 8)
    sessionStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
}

export default function CasePage() {
  const params = useParams()
  const caseId = decodeURIComponent(String(params.id ?? ''))
  const { role } = useRole()
  const focus = caseFocusForRole(role)
  const [data, setData] = useState<CaseResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setData(null)

    async function load() {
      const client = getReadClient(role)
      try {
        const res = await client.getCaseState(caseId)
        if (cancelled) return
        if (!res.found) {
          setError(res.ok === false ? 'Caso no encontrado' : 'Caso no encontrado en este nodo')
          setData(null)
          return
        }
        setError(null)
        setData(res)
        rememberCase(caseId)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    const interval = setInterval(() => void load(), 5000)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [caseId, role])

  const showTimeline = focus !== 'telemetry'
  const showChart = focus === 'full' || focus === 'custody' || focus === 'telemetry'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/dashboard/casos" className="text-xs text-muted-foreground hover:text-foreground">
            ← Nueva consulta
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight font-mono">{caseId}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Vista {ROLE_CONFIGS[role].name} · GET /dashboard/casos/{caseId}
          </p>
        </div>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Leyendo proyección del nodo…</p>}

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-card p-4">
          <p className="text-sm font-medium text-destructive">No se pudo mostrar el caso</p>
          <p className="text-sm text-muted-foreground mt-1 break-words">{error}</p>
          <p className="text-xs text-muted-foreground mt-2">
            El ledger no se modificó. Este ID no tiene transacciones, o el nodo no responde. Altura 0
            = todavía no corriste el script de demo. Nodo caído →{' '}
            <Link href="/infra" className="underline">
              /infra
            </Link>
            .
          </p>
        </div>
      )}

      {data?.state && (
        <>
          <CaseLifecycle state={data.state} telemetry={data.telemetry ?? []} />
          {focus !== 'telemetry' && (
            <CaseDetail caseState={data.state} telemetry={data.telemetry ?? []} focus={focus} />
          )}
          {showChart && (
            <TelemetryChart
              data={data.telemetry ?? []}
              title="Telemetría de custodia"
              description="Lecturas custody del ledger (IoT → hospital-donante). Se actualiza cada 5 s si el simulador está corriendo."
            />
          )}
          {showTimeline && <Timeline events={data.timeline ?? []} />}
        </>
      )}
    </div>
  )
}
