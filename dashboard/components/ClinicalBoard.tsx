'use client'

import Link from 'next/link'
import { useEffect, useState, type ReactNode } from 'react'
import { Activity, HeartPulse, Thermometer, Users } from 'lucide-react'
import { IOT_HEALTH_URL } from '@/lib/iot-health'
import { getReadClient } from '@/lib/read-client'
import { organLabel } from '@/lib/ui-labels'
import type { CustodySample, IotHealth, LedgerOverview, MatchCandidate, OverviewAssignment, RoleType } from '@/lib/types'
import { StatusPill } from '@/components/StatusPill'

function formatHla(p: { A?: string; B?: string; DR?: string } | null | undefined): string {
  if (!p) return '—'
  return [p.A, p.B, p.DR].filter(Boolean).join(' · ') || '—'
}

function formatWhen(iso?: string | null): string {
  if (!iso) return '—'
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return iso
  return new Date(t).toLocaleString('es-AR')
}

async function pingIot(): Promise<IotHealth | null> {
  try {
    const res = await fetch(IOT_HEALTH_URL, { cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json()) as IotHealth
  } catch {
    return null
  }
}

export function ClinicalBoard({ role = 'coordinador-nacional' }: { role?: RoleType }) {
  const [overview, setOverview] = useState<LedgerOverview | null>(null)
  const [iot, setIot] = useState<IotHealth | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const [board, sensor] = await Promise.all([getReadClient(role).getOverview(), pingIot()])
        if (cancelled) return
        setOverview(board)
        setIot(sensor)
        setError(null)
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
    return <p className="text-base text-muted-foreground">Cargando tablero…</p>
  }

  if (error && !overview) {
    return (
      <div className="rounded-lg border bg-card p-5">
        <p className="text-base font-medium text-destructive">No se pudo cargar el tablero</p>
        <p className="text-base mt-1 text-muted-foreground">{error}</p>
      </div>
    )
  }

  const counts = overview?.counts
  const empty = !counts || counts.ledgerBlocks === 0
  const assignment = overview?.assignments[0]
  const delivered = Boolean(assignment?.received)
  const iotUp = Boolean(iot?.ok) && !delivered
  const lastTemp = iot?.lastTempC ?? overview?.custody[0]?.lastTempC ?? null
  const tempAlert = !delivered && lastTemp != null && (lastTemp < 0 || lastTemp > 4)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat
          icon={<HeartPulse className="h-5 w-5" />}
          label="Donantes"
          value={String(counts?.donors ?? 0)}
          active={(counts?.donors ?? 0) > 0}
        />
        <Stat
          icon={<Users className="h-5 w-5" />}
          label="Lista de espera"
          value={String(counts?.waiting ?? 0)}
          hint={(counts?.waitingUnassigned ?? 0) > 0 ? `${counts?.waitingUnassigned} sin asignar` : undefined}
          active={(counts?.waiting ?? 0) > 0}
        />
        <Stat
          icon={<Activity className="h-5 w-5" />}
          label="Asignaciones"
          value={String(counts?.assignments ?? 0)}
          active={(counts?.assignments ?? 0) > 0}
        />
        <Stat
          icon={<Thermometer className="h-5 w-5" />}
          label="Traslado"
          value={delivered ? 'Entregado' : iotUp ? (iot?.phase === 'escribiendo' ? 'En curso' : 'En espera') : 'Inactivo'}
          hint={lastTemp != null ? `${lastTemp} °C` : undefined}
          active={delivered || iotUp}
          alert={tempAlert}
        />
      </div>

      {empty ? (
        <div className="rounded-lg border border-dashed bg-card px-5 py-8 text-center">
          <p className="text-lg font-medium">Sin actividad clínica</p>
          <p className="mt-1 text-base text-muted-foreground">Aún no hay donantes ni pacientes en lista.</p>
        </div>
      ) : (
        <>
          {(overview?.donors.length ?? 0) > 0 && (
            <section className="rounded-lg border bg-card p-5">
              <h2 className="text-lg font-semibold">Donantes</h2>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-base">
                  <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="text-left font-medium py-2 pr-3">Caso</th>
                      <th className="text-left font-medium py-2 pr-3">Órgano</th>
                      <th className="text-left font-medium py-2 pr-3">Sangre</th>
                      <th className="text-left font-medium py-2 pr-3">HLA</th>
                      <th className="text-left font-medium py-2">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview?.donors.map((d) => (
                      <tr key={d.donorId} className="border-t">
                        <td className="py-3 pr-3">
                          <Link
                            href={`/dashboard/casos/${encodeURIComponent(d.donorId)}`}
                            className="font-medium underline-offset-2 hover:underline"
                          >
                            {d.donorId}
                          </Link>
                        </td>
                        <td className="py-3 pr-3">{organLabel(d.organType)}</td>
                        <td className="py-3 pr-3 font-medium">{d.bloodType ?? '—'}</td>
                        <td className="py-3 pr-3 font-mono text-sm">{formatHla(d.hlaProfile)}</td>
                        <td className="py-3">
                          <StatusPill tone={d.received || d.assigned ? 'success' : 'warning'}>
                            {d.received ? 'Entregado' : d.assigned ? 'Asignado' : 'Disponible'}
                          </StatusPill>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {(overview?.waitingList.length ?? 0) > 0 && (
            <section className="rounded-lg border bg-card p-5">
              <h2 className="text-lg font-semibold">Lista de espera</h2>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-base">
                  <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="text-left font-medium py-2 pr-3">Paciente</th>
                      <th className="text-left font-medium py-2 pr-3">Sangre</th>
                      <th className="text-left font-medium py-2 pr-3">HLA</th>
                      <th className="text-left font-medium py-2 pr-3">Urgencia</th>
                      <th className="text-left font-medium py-2">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview?.waitingList.map((p) => (
                      <tr key={p.patientId} className="border-t">
                        <td className="py-3 pr-3">
                          <Link
                            href={`/dashboard/casos/${encodeURIComponent(p.assignedDonorId || p.patientId)}`}
                            className="font-medium underline-offset-2 hover:underline"
                          >
                            {p.patientId}
                          </Link>
                        </td>
                        <td className="py-3 pr-3 font-medium">{p.bloodType ?? '—'}</td>
                        <td className="py-3 pr-3 font-mono text-sm">{formatHla(p.hlaProfile)}</td>
                        <td className="py-3 pr-3">
                          <UrgencyDots level={p.urgencyLevel} />
                        </td>
                        <td className="py-3">
                          <StatusPill
                            tone={
                              p.status === 'recibido' || p.status === 'asignado' ? 'success' : 'warning'
                            }
                          >
                            {p.status === 'recibido'
                              ? 'Órgano recibido'
                              : p.status === 'asignado'
                                ? 'Asignado'
                                : 'En espera'}
                          </StatusPill>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {assignment && (
            <section className="rounded-lg border bg-card p-5">
              <h2 className="text-lg font-semibold">Compatibilidad</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Filtro de sangre, luego coincidencia HLA (loci A, B, DR) y urgencia como desempate.
              </p>
              <AssignmentPanel assignment={assignment} />
              {(overview?.matchRanking?.length ?? 0) > 0 && (
                <RankingTable rows={overview!.matchRanking!} />
              )}
            </section>
          )}

          {(iotUp || (counts?.custodyReadings ?? 0) > 0 || Boolean(assignment)) && (
            <section className="rounded-lg border bg-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">Contenedor</h2>
                <StatusPill
                  tone={delivered ? 'success' : iotUp ? (tempAlert ? 'danger' : 'success') : 'neutral'}
                >
                  {delivered ? 'Entregado' : iotUp ? (tempAlert ? 'Fuera de rango' : 'Activo') : 'Inactivo'}
                </StatusPill>
              </div>
              <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                <Metric
                  label="Dispositivo"
                  value={assignment?.custody?.deviceId || iot?.deviceId || 'sensor-contenedor-001'}
                />
                <Metric
                  label="Identidad PKI"
                  value={assignment?.custody?.deviceActor || `iot:${assignment?.custody?.deviceId || iot?.deviceId || 'sensor-contenedor-001'}`}
                />
                <Metric
                  label="Temperatura"
                  value={lastTemp != null ? `${lastTemp} °C` : '—'}
                  alert={tempAlert}
                />
                <Metric label="Lecturas" value={String(counts?.custodyReadings ?? 0)} />
              </div>
              {(assignment?.custody?.samples?.length ?? 0) > 0 && (
                <ReadingsTable samples={assignment!.custody!.samples!} />
              )}
            </section>
          )}
        </>
      )}
    </div>
  )
}

function UrgencyDots({ level }: { level: number | null }) {
  if (level == null) return <span>—</span>
  return (
    <span className="inline-flex items-center gap-2" title={`Urgencia ${level} de 5`}>
      <span className="inline-flex gap-0.5" aria-hidden>
        {Array.from({ length: 5 }).map((_, i) => (
          <span
            key={i}
            className={`h-2.5 w-2.5 rounded-full ${i < level ? 'bg-orange-600' : 'bg-slate-200'}`}
          />
        ))}
      </span>
      <span className="text-sm text-muted-foreground">{level}/5</span>
    </span>
  )
}

function Stat({
  icon,
  label,
  value,
  hint,
  active,
  alert,
}: {
  icon: ReactNode
  label: string
  value: string
  hint?: string
  active: boolean
  alert?: boolean
}) {
  return (
    <div
      className={`rounded-lg border px-4 py-4 ${
        alert
          ? 'border-red-300 bg-red-50'
          : active
            ? 'border-teal-700/30 bg-teal-50/60'
            : 'bg-card'
      }`}
    >
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <p className="text-xs uppercase tracking-wide">{label}</p>
      </div>
      <p className="text-2xl font-semibold mt-2 capitalize">{value}</p>
      {hint && <p className="text-sm mt-1 text-muted-foreground">{hint}</p>}
    </div>
  )
}

function RankingTable({ rows }: { rows: MatchCandidate[] }) {
  return (
    <div className="mt-6 overflow-x-auto">
      <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Candidatos ordenados</p>
      <table className="w-full text-base">
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
          {rows.map((row, i) => (
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
                  <span className="text-sm text-muted-foreground">No elegido</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ReadingsTable({ samples }: { samples: CustodySample[] }) {
  const ordered = [...samples].sort((a, b) => a.secuencia - b.secuencia)
  const shown =
    ordered.length <= 80
      ? ordered
      : [
          ...ordered.slice(0, 2),
          ...ordered.filter((s) => s.fueraDeRango),
          ...ordered.slice(-8),
        ].filter((s, i, arr) => arr.findIndex((x) => x.secuencia === s.secuencia) === i)
          .sort((a, b) => a.secuencia - b.secuencia)
  return (
    <div className="mt-5 overflow-x-auto">
      {ordered.length > shown.length && (
        <p className="text-sm text-muted-foreground mb-2">
          {ordered.length} lecturas. Se muestran inicio, alerta y final.
        </p>
      )}
      <table className="w-full text-base">
        <thead className="text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="text-left font-medium py-2 pr-3">#</th>
            <th className="text-left font-medium py-2 pr-3">Hora</th>
            <th className="text-left font-medium py-2 pr-3">Temp.</th>
            <th className="text-left font-medium py-2 pr-3">Humedad</th>
            <th className="text-left font-medium py-2">Alerta</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((s) => (
            <tr key={`${s.secuencia}-${s.timestamp}`} className="border-t">
              <td className="py-2 pr-3 tabular-nums">{s.secuencia}</td>
              <td className="py-2 pr-3 text-sm">{formatWhen(s.timestamp)}</td>
              <td className={`py-2 pr-3 font-medium ${s.fueraDeRango ? 'text-red-700' : ''}`}>
                {s.temperaturaC != null ? `${s.temperaturaC} °C` : '—'}
              </td>
              <td className="py-2 pr-3">{s.humedadPct != null ? `${s.humedadPct} %` : '—'}</td>
              <td className="py-2">{s.fueraDeRango ? <StatusPill tone="danger">Fuera de rango</StatusPill> : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Metric({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-base font-semibold break-all ${alert ? 'text-red-700' : ''}`}>{value}</p>
    </div>
  )
}

function AssignmentPanel({ assignment }: { assignment: OverviewAssignment }) {
  const score = assignment.hlaScore != null ? Math.round(assignment.hlaScore) : null
  return (
    <div className="mt-4 space-y-5">
      <div className="flex flex-wrap items-center gap-3 text-base">
        <Link
          href={`/dashboard/casos/${encodeURIComponent(assignment.donorId)}`}
          className="font-medium underline-offset-2 hover:underline"
        >
          {assignment.donorId}
        </Link>
        <span className="text-muted-foreground" aria-hidden>
          →
        </span>
        <span className="font-medium">{assignment.recipientId}</span>
        {assignment.organ ? <StatusPill tone="info">{organLabel(assignment.organ)}</StatusPill> : null}
        {assignment.received ? <StatusPill tone="success">Recibido</StatusPill> : null}
      </div>

      <div className="flex flex-wrap items-end gap-8">
        {score != null && (
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Compatibilidad HLA</p>
            <p className="text-3xl font-semibold tabular-nums mt-1">{score}</p>
            <p className="text-sm text-muted-foreground">sobre 100</p>
          </div>
        )}
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Asignado</p>
          <p className="text-base font-medium mt-1">{formatWhen(assignment.assignedAt)}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {assignment.hlaLoci.map((l) => (
          <span
            key={l.locus}
            className={`rounded-md px-3 py-1.5 text-sm font-mono font-medium ${
              l.match ? 'bg-teal-700 text-white' : 'bg-slate-200 text-slate-800'
            }`}
          >
            {l.locus} {l.donor ?? '—'} {l.match ? '=' : '≠'} {l.recipient ?? '—'}
          </span>
        ))}
      </div>
    </div>
  )
}
