'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { DEV_DONOR_ID, DEV_PATIENT_ID } from '@/lib/dev-fixtures'

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
  const [caseId, setCaseId] = useState('')
  const [recent, setRecent] = useState<string[]>([])

  useEffect(() => {
    setRecent(readRecent())
  }, [])

  function go(id: string) {
    const trimmed = id.trim()
    if (!trimmed) return
    router.push(`/dashboard/casos/${encodeURIComponent(trimmed)}`)
  }

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Consultar caso</h1>
        <p className="text-sm text-muted-foreground mt-1">
          No hay listado de pacientes. El nodo proyecta un caso por ID (donorId o patientId) que ya
          exista en bloques. Tras el script de demo: demo-pitch-donor-001.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          go(caseId)
        }}
        className="rounded-lg border bg-card p-4 space-y-3"
      >
        <label className="block">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            donorId o patientId
          </span>
          <input
            value={caseId}
            onChange={(e) => setCaseId(e.target.value)}
            className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm font-mono"
            autoFocus
          />
        </label>
        <button
          type="submit"
          className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          Leer proyección
        </button>
      </form>

      {recent.length > 0 && (
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Consultados en esta sesión</p>
          <ul className="space-y-1">
            {recent.map((id) => (
              <li key={id}>
                <Link href={`/dashboard/casos/${encodeURIComponent(id)}`} className="font-mono text-sm underline-offset-2 hover:underline">
                  {id}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Fixtures (solo si existen en el ledger):{' '}
        <Link className="font-mono underline-offset-2 hover:underline" href={`/dashboard/casos/${DEV_DONOR_ID}`}>
          {DEV_DONOR_ID}
        </Link>
        {' · '}
        <Link className="font-mono underline-offset-2 hover:underline" href={`/dashboard/casos/${DEV_PATIENT_ID}`}>
          {DEV_PATIENT_ID}
        </Link>
      </p>
    </div>
  )
}
