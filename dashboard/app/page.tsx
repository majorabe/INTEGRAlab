import Link from 'next/link'
import { Activity, Server } from 'lucide-react'

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center">
      <div className="mx-auto max-w-3xl px-6 py-16 w-full">
        <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">INTEGRA</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Coordinación de trasplantes</h1>
        <p className="mt-3 text-base text-zinc-400 max-w-xl">
          Dos vistas, una sola fuente de verdad: el ledger de la red.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <Link
            href="/dashboard"
            className="rounded-lg border border-zinc-700 bg-zinc-900 p-6 hover:border-teal-400/50 transition-colors"
          >
            <Activity className="h-6 w-6 text-teal-300" />
            <h2 className="mt-3 text-xl font-semibold">Consulta clínica</h2>
            <p className="mt-2 text-base text-zinc-400">
              Donantes, lista de espera, asignaciones y temperatura del traslado.
            </p>
          </Link>

          <Link
            href="/infra"
            className="rounded-lg border border-zinc-700 bg-zinc-900 p-6 hover:border-emerald-500/60 transition-colors"
          >
            <Server className="h-6 w-6 text-emerald-400" />
            <h2 className="mt-3 text-xl font-semibold">Infraestructura</h2>
            <p className="mt-2 text-base text-zinc-400">
              Nodos, quorum, consistencia del ledger y verificación de la red.
            </p>
          </Link>
        </div>
      </div>
    </div>
  )
}
