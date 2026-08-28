'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { HonestyTable } from '@/components/HonestyTable'
import { DEV_DONOR_ID } from '@/lib/dev-fixtures'

export default function DashboardHome() {
  const router = useRouter()
  const [caseId, setCaseId] = useState('')

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const id = caseId.trim()
    if (!id) return
    router.push(`/dashboard/casos/${encodeURIComponent(id)}`)
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Consulta de casos</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Pedí un ID que exista en el ledger (donorId o patientId). La respuesta es la proyección
          GET /dashboard/casos/:id del nodo seleccionado. No hay listado mágico ni datos de demo inyectados.
        </p>
      </div>

      <form onSubmit={onSubmit} className="rounded-lg border bg-card p-4 flex flex-wrap gap-3 items-end">
        <label className="flex-1 min-w-[16rem]">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">ID de caso</span>
          <input
            value={caseId}
            onChange={(e) => setCaseId(e.target.value)}
            placeholder="ej. donor-001"
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
        Si en este entorno cargaste el fixture de desarrollo, podés probar{' '}
        <Link href={`/dashboard/casos/${DEV_DONOR_ID}`} className="font-mono text-foreground underline underline-offset-2">
          {DEV_DONOR_ID}
        </Link>
        . Si no está en el ledger, la página va a decir que no existe.
      </p>

      <HonestyTable />
    </div>
  )
}
