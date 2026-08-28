import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center">
      <div className="mx-auto max-w-3xl px-6 py-16 w-full">
        <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">INTEGRAlab</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Coordinación de trasplantes sobre ledger real</h1>
        <p className="mt-3 text-sm text-zinc-400 max-w-xl">
          El ledger, la PKI y los nodos son la fuente de verdad. Esta UI no inventa datos ni escribe bloques.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <Link
            href="/infra"
            className="rounded-lg border border-zinc-700 bg-zinc-900 p-5 hover:border-emerald-500/60 transition-colors"
          >
            <p className="text-[11px] uppercase tracking-wide text-emerald-400">Prioridad</p>
            <h2 className="mt-1 text-lg font-semibold">Infraestructura</h2>
            <p className="mt-2 text-sm text-zinc-400">
              Estado crudo de los 4 nodos, consistencia del ledger, quorum y suite de tests.
            </p>
            <p className="mt-4 font-mono text-xs text-zinc-500">/infra</p>
          </Link>

          <Link
            href="/dashboard"
            className="rounded-lg border border-zinc-700 bg-zinc-900 p-5 hover:border-teal-400/50 transition-colors"
          >
            <p className="text-[11px] uppercase tracking-wide text-teal-300">Consulta</p>
            <h2 className="mt-1 text-lg font-semibold">Dashboard clínico</h2>
            <p className="mt-2 text-sm text-zinc-400">
              Proyección de lectura de un caso: estado, timeline y telemetría. Solo GET.
            </p>
            <p className="mt-4 font-mono text-xs text-zinc-500">/dashboard</p>
          </Link>
        </div>
      </div>
    </div>
  )
}
