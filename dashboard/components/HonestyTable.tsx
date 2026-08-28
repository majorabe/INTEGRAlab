export function HonestyTable() {
  const rows: Array<{ level: 'real' | 'simple' | 'no'; title: string; detail: string }> = [
    {
      level: 'real',
      title: 'Ledger, PKI y endorsement',
      detail: 'Hash-chain, certificados X.509, política N-de-M y 4 nodos replicados. Los datos de esta UI salen de GET /dashboard/* sobre ese ledger.',
    },
    {
      level: 'real',
      title: 'Esta interfaz no escribe',
      detail: 'No hay /sign ni /tx desde el dashboard. Registrar donantes o asignar órganos se hace contra los nodos (tests, curl), no acá.',
    },
    {
      level: 'simple',
      title: 'Una identidad por organización',
      detail: 'El selector elige el nodo (puerto 3001–3004), no un usuario individual dentro del hospital.',
    },
    {
      level: 'simple',
      title: 'Telemetría del simulador',
      detail: 'Las lecturas vienen del iot-simulator, no de un sensor físico.',
    },
    {
      level: 'no',
      title: 'IA, HIS/EMR, Fabric',
      detail: 'No hay modelo de riesgo, ni historia clínica externa, ni Hyperledger Fabric. El ledger es el prototipo propio.',
    },
  ]

  const badge = {
    real: 'bg-emerald-100 text-emerald-900',
    simple: 'bg-amber-100 text-amber-900',
    no: 'bg-slate-200 text-slate-700',
  }
  const label = { real: 'Real', simple: 'Simplificado', no: 'No implementado' }

  return (
    <section className="rounded-lg border bg-card">
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Qué es real y qué no</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Esta UI no inventa casos. Si el ledger está vacío o el ID no existe, se muestra vacío.
        </p>
      </div>
      <ul className="divide-y">
        {rows.map((row) => (
          <li key={row.title} className="px-4 py-3 flex gap-3">
            <span className={`shrink-0 h-fit rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badge[row.level]}`}>
              {label[row.level]}
            </span>
            <div>
              <p className="text-sm font-medium">{row.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{row.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
