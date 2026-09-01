'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { HonestyTable } from '@/components/HonestyTable'
import { IntegrityCheck } from '@/components/IntegrityCheck'
import { useRole } from '@/lib/role-context'
import { getReadClient } from '@/lib/read-client'

export default function DashboardHome() {
  const router = useRouter()
  const { role } = useRole()
  const [caseId, setCaseId] = useState('')
  const [blocks, setBlocks] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    getReadClient(role)
      .getNodeHealth()
      .then((h) => {
        if (!cancelled) setBlocks(h.ledgerBlocks ?? 0)
      })
      .catch(() => {
        if (!cancelled) setBlocks(null)
      })
    return () => {
      cancelled = true
    }
  }, [role])

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const id = caseId.trim()
    if (!id) return
    router.push(`/dashboard/casos/${encodeURIComponent(id)}`)
  }

  const redVacia = blocks === 0
  const hayHechos = typeof blocks === 'number' && blocks > 0

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Consulta de un caso</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Esta pantalla no es un HIS ni una lista de pacientes. Reconstruye <strong>un</strong> caso
          a partir de bloques ya grabados: donante, lista de espera, asignación y, si el traslado
          empezó, telemetría IoT. Sin ID en el ledger, no hay nada que mostrar.
        </p>
      </div>

      {redVacia && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-950/20 p-4 text-sm">
          <p className="font-medium">Red viva, ledger clínico vacío</p>
          <p className="text-muted-foreground mt-1">
            Los nodos están arriba y la altura es 0: todavía no hubo donante, lista ni asignación.
            El IoT no escribe en este estado. En{' '}
            <Link href="/infra" className="underline">
              /infra
            </Link>{' '}
            deberías ver altura 0 en los 4 nodos. Para el recorrido de prueba:{' '}
            <code className="font-mono text-xs">bash scripts/setup-demo-pitch-data.sh</code>
          </p>
        </div>
      )}

      {hayHechos && (
        <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          Este nodo reporta <span className="font-mono text-foreground">{blocks}</span> bloques. Eso
          incluye hechos clínicos y, si el simulador IoT ya corre, lecturas custody cada ~5 s.
          Consultá el ID del caso (en el pitch:{' '}
          <span className="font-mono">demo-pitch-donor-001</span>).
        </div>
      )}

      <form onSubmit={onSubmit} className="rounded-lg border bg-card p-4 flex flex-wrap gap-3 items-end">
        <label className="flex-1 min-w-[16rem]">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            donorId o patientId
          </span>
          <input
            value={caseId}
            onChange={(e) => setCaseId(e.target.value)}
            placeholder="demo-pitch-donor-001"
            className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm font-mono"
          />
        </label>
        <button
          type="submit"
          className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Consultar
        </button>
      </form>

      <p className="text-xs text-muted-foreground">
        ID del script de demo:{' '}
        <Link
          href="/dashboard/casos/demo-pitch-donor-001"
          className="font-mono text-foreground underline underline-offset-2"
        >
          demo-pitch-donor-001
        </Link>
        . Si no corriste el script, la ficha dice que no existe.
      </p>

      <IntegrityCheck />
      <HonestyTable />
    </div>
  )
}
