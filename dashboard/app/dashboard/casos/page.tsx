'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { HeartPulse, Search, User } from 'lucide-react'
import { useRole } from '@/lib/role-context'
import { getReadClient } from '@/lib/read-client'
import { organLabel } from '@/lib/ui-labels'
import type { LedgerOverview } from '@/lib/types'
import { StatusPill } from '@/components/StatusPill'

const RECENT_KEY = 'integra-recent-cases'

function readRecent(): string[] {
  try {
    const raw = sessionStorage.getItem(RECENT_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

export default function CasosLookupPage() {
  const router = useRouter()
  const { role } = useRole()
  const [caseId, setCaseId] = useState('')
  const [recent, setRecent] = useState<string[]>([])
  const [overview, setOverview] = useState<LedgerOverview | null>(null)

  useEffect(() => {
    setRecent(readRecent())
  }, [])

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

  function go(id: string) {
    const trimmed = id.trim()
    if (!trimmed) return
    router.push(`/dashboard/casos/${encodeURIComponent(trimmed)}`)
  }

  const assignments = overview?.assignments ?? []
  const inProgress = assignments.filter((a) => !a.received)
  const delivered = assignments.filter((a) => a.received)
  const unassignedDonors = (overview?.donors ?? []).filter((d) => !d.assigned)
  const waiting = (overview?.waitingList ?? []).filter(
    (p) => p.status !== 'asignado' && p.status !== 'recibido'
  )
  const hasCases = inProgress.length + delivered.length + unassignedDonors.length + waiting.length > 0

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Consultar caso</h1>
      </div>

      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault()
          go(caseId)
        }}
        className="rounded-lg border bg-card p-5"
      >
        <label className="block">
          <span className="text-sm font-medium text-muted-foreground">Identificador</span>
          <div className="mt-2 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={caseId}
                onChange={(e) => setCaseId(e.target.value)}
                placeholder="Donante o paciente"
                className="h-11 w-full rounded-md border border-input bg-background pl-10 pr-3 text-base"
                autoFocus
              />
            </div>
            <button
              type="submit"
              className="h-11 rounded-md bg-primary px-5 text-base font-medium text-primary-foreground"
            >
              Abrir
            </button>
          </div>
        </label>
      </form>

      {recent.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {recent.map((id) => (
            <Link
              key={id}
              href={`/dashboard/casos/${encodeURIComponent(id)}`}
              className="rounded-full border bg-card px-3 py-1.5 text-sm hover:bg-accent"
            >
              {id}
            </Link>
          ))}
        </div>
      )}

      {hasCases ? (
        <div className="space-y-6">
          {inProgress.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">En curso</h2>
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
              <h2 className="text-lg font-semibold">Recibidos</h2>
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
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {unassignedDonors.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">Donantes disponibles</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {unassignedDonors.map((d) => (
                  <Link
                    key={d.donorId}
                    href={`/dashboard/casos/${encodeURIComponent(d.donorId)}`}
                    className="rounded-lg border bg-card p-4 hover:border-teal-700/40 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <HeartPulse className="h-5 w-5 text-muted-foreground" />
                        <span className="font-semibold">{organLabel(d.organType)}</span>
                      </div>
                      <StatusPill tone="warning">Disponible</StatusPill>
                    </div>
                    <p className="mt-3 text-base">{d.donorId}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{d.bloodType ?? '—'}</p>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {waiting.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">En lista de espera</h2>
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
          <Search className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-lg font-medium">No hay casos en el ledger</p>
        </div>
      )}
    </div>
  )
}
