'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRole } from '@/lib/role-context'
import { getReadClient } from '@/lib/read-client'
import { organLabel } from '@/lib/ui-labels'
import type { LedgerOverview } from '@/lib/types'
import { StatusPill } from '@/components/StatusPill'

const TX_LABEL: Record<string, string> = {
  'donor-registry': 'Donante',
  'waiting-list': 'Lista de espera',
  assignment: 'Asignación',
  custody: 'Custodia (lecturas)',
  reception: 'Recepción',
}

function formatHla(p: { A?: string; B?: string; DR?: string } | null | undefined): string {
  if (!p) return '—'
  return [p.A, p.B, p.DR].filter(Boolean).join(' · ') || '—'
}

export default function EstadisticasPage() {
  const { role } = useRole()
  const [overview, setOverview] = useState<LedgerOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [updatedAt, setUpdatedAt] = useState('')

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const board = await getReadClient(role).getOverview()
        if (cancelled) return
        setOverview(board)
        setError(null)
        setUpdatedAt(new Date().toLocaleTimeString('es-AR'))
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    const id = setInterval(() => void load(), 5000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [role])

  if (loading && !overview) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-semibold tracking-tight">Estadísticas</h1>
        <p className="text-base text-muted-foreground">Cargando…</p>
      </div>
    )
  }

  if (error && !overview) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-semibold tracking-tight">Estadísticas</h1>
        <div className="rounded-lg border border-destructive/30 bg-card p-4">
          <p className="text-sm font-medium text-destructive">No se pudieron cargar las estadísticas clínicas</p>
          <p className="text-sm text-muted-foreground mt-1">{error}</p>
        </div>
      </div>
    )
  }

  const counts = overview?.counts
  const empty = !counts || counts.ledgerBlocks === 0
  const assignment = overview?.assignments[0]
  const waitingUnassigned = counts?.waitingUnassigned ?? 0
  const received = overview?.assignments.filter((a) => a.received).length ?? 0
  const inTransit = overview?.assignments.filter((a) => !a.received).length ?? 0
  const alerts = (overview?.custody ?? []).reduce((n, c) => n + (c.alertCount ?? 0), 0)
  const ranking = overview?.matchRanking ?? []

  const facts = [
    { key: 'donor-registry', n: overview?.donors.length ?? 0 },
    { key: 'waiting-list', n: overview?.waitingList.length ?? 0 },
    { key: 'assignment', n: overview?.assignments.length ?? 0 },
    { key: 'custody', n: counts?.custodyReadings ?? 0 },
    { key: 'reception', n: received },
  ]
  const factsTotal = facts.reduce((s, f) => s + f.n, 0) || 1

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Estadísticas</h1>
        <p className="mt-1 text-base text-muted-foreground max-w-2xl">
          Resumen clínico del ledger: cuántos donantes, candidatos, asignaciones y lecturas de frío.
        </p>
        {updatedAt && <p className="mt-1 text-sm text-muted-foreground">Actualizado {updatedAt}</p>}
      </div>

      {empty ? (
        <div className="rounded-lg border border-dashed bg-card px-5 py-10 text-center">
          <p className="text-lg font-medium">Sin actividad clínica</p>
          <p className="mt-1 text-base text-muted-foreground">Todavía no hay hechos en el ledger.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Donantes" value={String(counts?.donors ?? 0)} />
            <Stat label="En espera" value={String(waitingUnassigned)} hint={`${counts?.waiting ?? 0} en lista`} />
            <Stat label="Asignaciones" value={String(counts?.assignments ?? 0)} hint={received ? `${received} recibidas` : inTransit ? 'en traslado' : undefined} />
            <Stat
              label="Cadena de frío"
              value={String(counts?.custodyReadings ?? 0)}
              hint={alerts > 0 ? `${alerts} fuera de rango` : 'lecturas'}
              alert={alerts > 0}
            />
          </div>

          {assignment && (
            <section className="rounded-lg border bg-card p-5">
              <h2 className="text-lg font-semibold">Asignación vigente</h2>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Link
                  href={`/dashboard/casos/${encodeURIComponent(assignment.donorId)}`}
                  className="font-medium underline-offset-2 hover:underline"
                >
                  {assignment.donorId}
                </Link>
                <span className="text-muted-foreground">→</span>
                <span className="font-medium">{assignment.recipientId}</span>
                {assignment.organ ? <StatusPill tone="info">{organLabel(assignment.organ)}</StatusPill> : null}
                {assignment.received ? <StatusPill tone="success">Recibido</StatusPill> : <StatusPill tone="info">En traslado</StatusPill>}
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                {assignment.donorBloodType ?? '—'} · {assignment.recipientBloodType ?? '—'}
                {assignment.hlaScore != null ? ` · HLA ${Math.round(assignment.hlaScore)} / 100` : ''}
                {assignment.custody?.readings ? ` · ${assignment.custody.readings} lecturas` : ''}
                {assignment.custody?.deviceId ? ` · ${assignment.custody.deviceId}` : ''}
              </p>
            </section>
          )}

          {ranking.length > 0 && (
            <section className="rounded-lg border bg-card p-5 overflow-x-auto">
              <h2 className="text-lg font-semibold">Ranking de compatibilidad</h2>
              <p className="mt-1 text-sm text-muted-foreground">Sangre, luego HLA (A, B, DR), urgencia como desempate.</p>
              <table className="mt-4 w-full text-base">
                <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="text-left font-medium py-2 pr-3">#</th>
                    <th className="text-left font-medium py-2 pr-3">Paciente</th>
                    <th className="text-left font-medium py-2 pr-3">Sangre</th>
                    <th className="text-left font-medium py-2 pr-3">HLA</th>
                    <th className="text-left font-medium py-2 pr-3">Score</th>
                    <th className="text-left font-medium py-2 pr-3">Urgencia</th>
                    <th className="text-left font-medium py-2">Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((row, i) => (
                    <tr key={row.patientId} className="border-t">
                      <td className="py-2 pr-3 text-muted-foreground">{i + 1}</td>
                      <td className="py-2 pr-3 font-medium">{row.patientId}</td>
                      <td className="py-2 pr-3">{row.bloodType ?? '—'}</td>
                      <td className="py-2 pr-3 font-mono text-sm">{formatHla(row.hlaProfile)}</td>
                      <td className="py-2 pr-3 tabular-nums">{Math.round(row.hlaScore)}</td>
                      <td className="py-2 pr-3">{row.urgencyLevel ?? '—'}/5</td>
                      <td className="py-2">
                        {row.selected ? (
                          <StatusPill tone="success">Asignado</StatusPill>
                        ) : (
                          <span className="text-sm text-muted-foreground">En espera</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <section className="rounded-lg border bg-card p-5">
            <h2 className="text-lg font-semibold">Hechos en el ledger</h2>
            <p className="mt-1 text-sm text-muted-foreground">{counts?.ledgerBlocks ?? 0} bloques en total.</p>
            <div className="mt-4 space-y-3">
              {facts.map(({ key, n }) => (
                <div key={key} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{TX_LABEL[key] ?? key}</span>
                    <span className="text-muted-foreground">{n}</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div className="bg-primary h-2 rounded-full" style={{ width: `${(n / factsTotal) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}

function Stat({
  label,
  value,
  hint,
  alert,
}: {
  label: string
  value: string
  hint?: string
  alert?: boolean
}) {
  return (
    <div className={`rounded-lg border px-4 py-4 ${alert ? 'border-red-300 bg-red-50' : 'bg-card'}`}>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-3xl font-semibold mt-2">{value}</p>
      {hint && <p className="text-sm mt-1 text-muted-foreground">{hint}</p>}
    </div>
  )
}
