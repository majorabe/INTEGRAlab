'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useRole } from '@/lib/role-context'
import { caseFocusForRole } from '@/lib/roles'
import { getReadClient } from '@/lib/read-client'
import { organLabel } from '@/lib/ui-labels'
import { CaseResponse } from '@/lib/types'
import { CaseDetail } from '@/components/CaseDetail'
import { Timeline } from '@/components/Timeline'
import { TelemetryChart } from '@/components/TelemetryChart'
import { CaseLifecycle } from '@/components/CaseLifecycle'
import { StatusPill } from '@/components/StatusPill'

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
  const router = useRouter()
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
          setError('Caso no encontrado')
          setData(null)
          return
        }
        setError(null)
        setData(res)
        const donorId = res.state?.assignmentInfo?.donorId
        const patientId = res.state?.recipientInfo?.patientId
        if (donorId && caseId === patientId && donorId !== caseId) {
          rememberCase(donorId)
          router.replace(`/dashboard/casos/${encodeURIComponent(donorId)}`)
          return
        }
        rememberCase(donorId || caseId)
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
  const organ = data?.state?.donorInfo?.organType ?? data?.state?.assignmentInfo?.organ
  const assigned = Boolean(data?.state?.assignmentInfo)
  const inTransit = (data?.telemetry?.length ?? 0) > 0
  const received = Boolean(data?.state?.receptionInfo)

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/casos" className="text-sm text-muted-foreground hover:text-foreground">
          ← Consultar otro caso
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">{organLabel(organ) !== '—' ? organLabel(organ) : caseId}</h1>
          {received && <StatusPill tone="success">Recibido en hospital</StatusPill>}
          {assigned && !received && <StatusPill tone="success">Asignado</StatusPill>}
          {inTransit && !received && <StatusPill tone="info">En traslado</StatusPill>}
        </div>
        <p className="text-base text-muted-foreground mt-1">
          {data?.state?.assignmentInfo
            ? `${data.state.assignmentInfo.donorId} → ${data.state.assignmentInfo.recipientId}`
            : data?.state?.recipientInfo
              ? `Candidato ${data.state.recipientInfo.patientId}`
              : caseId}
        </p>
      </div>

      {loading && <p className="text-base text-muted-foreground">Cargando ficha…</p>}

      {error && (
        <div className="rounded-lg border border-dashed bg-card px-5 py-8 text-center">
          <p className="text-lg font-medium">No se encontró el caso</p>
          <p className="text-base text-muted-foreground mt-1">{error}</p>
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
              title="Temperatura del traslado"
              description="Cadena de frío del contenedor"
            />
          )}
          {showTimeline && <Timeline events={data.timeline ?? []} />}
        </>
      )}
    </div>
  )
}
