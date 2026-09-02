'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { HeartPulse, User } from 'lucide-react'
import { useRole } from '@/lib/role-context'
import { getReadClient } from '@/lib/read-client'
import { organLabel } from '@/lib/ui-labels'
import type { LedgerOverview, OverviewDonor } from '@/lib/types'
import { StatusPill } from '@/components/StatusPill'

function formatHla(p: { A?: string; B?: string; DR?: string } | null | undefined): string {
  if (!p) return ''
  const parts = [p.A, p.B, p.DR].filter(Boolean)
  return parts.length ? parts.join(' · ') : ''
}

function donorTone(d: OverviewDonor): 'success' | 'info' | 'warning' {
  if (d.received) return 'success'
  if (d.assigned) return 'info'
  return 'warning'
}

function donorStatus(d: OverviewDonor): string {
  if (d.received) return 'Entregado'
  if (d.assigned) return 'Asignado'
  return 'Disponible'
}

export default function CasosLookupPage() {
  const { role } = useRole()
  const [overview, setOverview] = useState<LedgerOverview | null>(null)

  useEffect(() => {
    let cancelled = false
    getReadClient(role)
      .getOverview()
      .then((board) => {
        if (!cancelled) setOverview(board)
      })
      .catch(() => {
        if (!cancelled) setOverview(null)
      })
    return () => {
      cancelled = true
    }
  }, [role])

  const donors = overview?.donors ?? []
  const assignments = overview?.assignments ?? []
  const inProgress = assignments.filter((a) => !a.received)
  const delivered = assignments.filter((a) => a.received)
  const waiting = (overview?.waitingList ?? []).filter((p) => p.status === 'en-espera')
  const hasCases = donors.length + assignments.length + waiting.length > 0

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Consultar caso</h1>
      </div>

      {hasCases ? (
        <div className="space-y-8">
          {donors.length > 0 && (
            <section className="space-y-3">
              <div>
                <h2 className="text-lg font-semibold">Donantes</h2>
                <p className="text-sm text-muted-foreground">Órgano registrado en el ledger, antes de asignar o ya asignado.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {donors.map((d) => (
                  <Link
                    key={d.donorId}
                    href={`/dashboard/casos/${encodeURIComponent(d.donorId)}`}
                    className="rounded-lg border bg-card p-4 hover:border-teal-700/40 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 text-teal-800">
                        <HeartPulse className="h-5 w-5" />
                        <span className="font-semibold">{organLabel(d.organType)}</span>
                      </div>
                      <StatusPill tone={donorTone(d)}>{donorStatus(d)}</StatusPill>
                    </div>
                    <p className="mt-3 text-base font-medium">{d.donorId}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {[d.bloodType, formatHla(d.hlaProfile)].filter(Boolean).join(' · ') || '—'}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {inProgress.length > 0 && (
            <section className="space-y-3">
              <div>
                <h2 className="text-lg font-semibold">En traslado</h2>
                <p className="text-sm text-muted-foreground">Órgano asignado; el hospital receptor aún no confirmó la llegada.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {inProgress.map((a) => (
                  <Link
                    key={`${a.donorId}-${a.recipientId}`}
                    href={`/dashboard/casos/${encodeURIComponent(a.donorId)}`}
                    className="rounded-lg border bg-card p-4 hover:border-teal-700/40 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 text-teal-800">
                        <HeartPulse className="h-5 w-5" />
                        <span className="font-semibold">{organLabel(a.organ)}</span>
                      </div>
                      <StatusPill tone="info">En traslado</StatusPill>
                    </div>
                    <p className="mt-3 text-base">
                      {a.donorId}
                      <span className="text-muted-foreground"> → </span>
                      {a.recipientId}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {a.donorBloodType ?? '—'} · {a.recipientBloodType ?? '—'}
                      {a.hlaScore != null ? ` · HLA ${Math.round(a.hlaScore)}` : ''}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {delivered.length > 0 && (
            <section className="space-y-3">
              <div>
                <h2 className="text-lg font-semibold">Asignaciones entregadas</h2>
                <p className="text-sm text-muted-foreground">
                  Donante vinculado a un paciente y recepción confirmada en el hospital destino.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {delivered.map((a) => (
                  <Link
                    key={`${a.donorId}-${a.recipientId}-rx`}
                    href={`/dashboard/casos/${encodeURIComponent(a.donorId)}`}
                    className="rounded-lg border bg-card p-4 hover:border-teal-700/40 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 text-teal-800">
                        <HeartPulse className="h-5 w-5" />
                        <span className="font-semibold">{organLabel(a.organ)}</span>
                      </div>
                      <StatusPill tone="success">Recibido</StatusPill>
                    </div>
                    <p className="mt-3 text-base">
                      {a.donorId}
                      <span className="text-muted-foreground"> → </span>
                      {a.recipientId}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {a.donorBloodType ?? '—'} · {a.recipientBloodType ?? '—'}
                      {a.hlaScore != null ? ` · HLA ${Math.round(a.hlaScore)}` : ''}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {waiting.length > 0 && (
            <section className="space-y-3">
              <div>
                <h2 className="text-lg font-semibold">Lista de espera</h2>
                <p className="text-sm text-muted-foreground">Candidatos sin órgano asignado.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {waiting.map((p) => (
                  <Link
                    key={p.patientId}
                    href={`/dashboard/casos/${encodeURIComponent(p.patientId)}`}
                    className="rounded-lg border bg-card p-4 hover:border-teal-700/40 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <User className="h-5 w-5 text-muted-foreground" />
                        <span className="font-semibold">Paciente</span>
                      </div>
                      <StatusPill tone="warning">En espera</StatusPill>
                    </div>
                    <p className="mt-3 text-base">{p.patientId}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {p.bloodType ?? '—'}
                      {formatHla(p.hlaProfile) ? ` · ${formatHla(p.hlaProfile)}` : ''}
                      {p.urgencyLevel != null ? ` · urgencia ${p.urgencyLevel}/5` : ''}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed bg-card px-5 py-10 text-center">
          <HeartPulse className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-lg font-medium">No hay casos en el ledger</p>
        </div>
      )}
    </div>
  )
}
