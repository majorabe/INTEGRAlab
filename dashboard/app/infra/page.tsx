'use client'

/**
 * Panel de infraestructura INTEGRA — /infra
 *
 * Independiente del dashboard clínico: fetch nativo a cada nodo, sin
 * api-client.ts, sin routing por rol, sin CaseDetail/TelemetryChart/etc.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, MinusCircle, RefreshCw, Server, ShieldAlert, XCircle } from 'lucide-react'
import { AUTO_REFRESH_MS, NODES, ORDERER_ID, QUORUM_NODOS, TOTAL_NODOS } from './nodes.config'
import { pingAllNodes, type NodeSnapshot, type NodeStatus } from './ping-node'

interface TestResult {
  name: string
  passed: boolean
  skipped?: boolean
  detail: string
  ms?: number
}

interface FailedTest {
  name: string
  detail: string
}

interface SuiteResult {
  ok: boolean
  timedOut?: boolean
  error?: string
  command?: string
  passed: number
  total: number
  failed: FailedTest[]
  tests?: TestResult[]
  skipped?: number
  stdout: string
  stderr: string
  exitCode: number | null
  durationMs: number
}

const ATTACK_DEMOS: Array<{ id: string; title: string; tests: string[] }> = [
  { id: 'A1', title: 'Firma falsa', tests: ['test02_rechazoSpoofing'] },
  { id: 'A2', title: 'Identidad de otra org', tests: ['test04_certOtraOrg'] },
  { id: 'A3', title: 'Firma alterada / ausente', tests: ['test06_donorRegistrySinFirma'] },
  { id: 'A4', title: 'Waiting-list con 1 firma', tests: ['test08_waitingListUnaSolaFirma'] },
  { id: 'A5', title: 'Assignment sin hospital', tests: ['test09_assignmentSinEndorsement'] },
  { id: 'A6', title: 'Lectura sin actor', tests: ['test13_lecturaNoAutorizada'] },
  { id: 'A7', title: 'IoT en waiting-list', tests: ['test14_iotNoEscribeWaitingList'] },
  { id: 'A8', title: 'Replay de timestamp', tests: ['test12_replayTelemetria'] },
]

function attackOutcome(
  tests: TestResult[] | undefined,
  names: string[]
): 'pass' | 'fail' | 'skip' | 'pending' {
  if (!tests?.length) return 'pending'
  const hits = tests.filter((t) => names.includes(t.name))
  if (!hits.length) return 'pending'
  if (hits.some((t) => !t.passed && !t.skipped)) return 'fail'
  if (hits.every((t) => t.skipped)) return 'skip'
  return 'pass'
}

type ConsistencyKind = 'consistent' | 'divergent' | 'partial' | 'insufficient'

interface Divergence {
  kind: 'height' | 'fork'
  nodes: string[]
  detail: string
}

interface ConsistencyReport {
  kind: ConsistencyKind
  message: string
  divergences: Divergence[]
  downIds: string[]
}

function formatAgo(ts: number | null, now: number): string {
  if (!ts) return 'nunca'
  const s = Math.max(0, Math.floor((now - ts) / 1000))
  if (s < 5) return 'hace un instante'
  if (s < 60) return `hace ${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `hace ${m}m`
  return `hace ${Math.floor(m / 60)}h`
}

function formatAgoIso(iso: string | null, now: number): string {
  if (!iso) return '—'
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return iso
  return formatAgo(t, now)
}

function truncateHash(hash: string | null): { short: string; full: string } | null {
  if (!hash) return null
  return { short: `${hash.slice(0, 8)}…`, full: hash }
}

function deltaLabel(delta: number | null): { text: string; className: string } {
  if (delta == null) return { text: '—', className: 'text-zinc-500' }
  if (delta === 0) return { text: 'al día', className: 'text-emerald-300' }
  if (delta < 0) return { text: `${Math.abs(delta)} atrás`, className: 'text-amber-300' }
  return { text: `+${delta} adelantado`, className: 'text-red-300' }
}

function latencyClass(ms: number | null): string {
  if (ms == null) return 'text-zinc-400'
  if (ms >= 1000) return 'text-red-300'
  if (ms >= 200) return 'text-amber-300'
  return 'text-zinc-200'
}

function statusMeta(status: NodeStatus): { label: string; ring: string; badge: string } {
  switch (status) {
    case 'up':
      return { label: 'En línea', ring: 'border-emerald-500/70', badge: 'bg-emerald-500 text-emerald-950' }
    case 'timeout':
      return { label: 'Sin respuesta', ring: 'border-amber-400/70', badge: 'bg-amber-400 text-amber-950' }
    case 'reject':
      return { label: 'Rechaza', ring: 'border-orange-400/70', badge: 'bg-orange-400 text-orange-950' }
    case 'down':
      return { label: 'Caído', ring: 'border-red-500/70', badge: 'bg-red-500 text-white' }
    default:
      return { label: '—', ring: 'border-zinc-700', badge: 'bg-zinc-700 text-zinc-100' }
  }
}

function StatusIcon({ status }: { status: NodeStatus }) {
  const cls = 'h-5 w-5'
  switch (status) {
    case 'up':
      return <CheckCircle2 className={`${cls} text-emerald-400`} />
    case 'timeout':
      return <AlertTriangle className={`${cls} text-amber-300`} />
    case 'reject':
      return <ShieldAlert className={`${cls} text-orange-300`} />
    case 'down':
      return <XCircle className={`${cls} text-red-400`} />
    default:
      return <Server className={`${cls} text-zinc-500`} />
  }
}

function buildConsistency(snapshots: NodeSnapshot[]): ConsistencyReport {
  const up = snapshots.filter((s) => s.status === 'up')
  const downIds = snapshots.filter((s) => s.status !== 'up').map((s) => s.id)

  if (up.length < 2) {
    return {
      kind: 'insufficient',
      message:
        up.length === 0
          ? 'Ningún nodo responde: no hay datos para comparar el ledger.'
          : `Solo ${up[0].id} responde; se necesitan al menos 2 nodos para detectar un fork.`,
      divergences: [],
      downIds,
    }
  }

  const heightSet = new Set(up.map((s) => String(s.tipIndex ?? s.ledgerHeight)))
  const hashSet = new Set(up.map((s) => s.tipHash ?? ''))
  const allSameHeight = heightSet.size === 1
  const allSameHash = hashSet.size === 1
  const matching = allSameHeight && allSameHash

  const divergences: Divergence[] = []
  if (!allSameHeight) {
    const byHeight = new Map<string, string[]>()
    for (const s of up) {
      const key = `bloque #${s.tipIndex ?? '—'} (altura ${s.ledgerHeight ?? '—'})`
      byHeight.set(key, [...(byHeight.get(key) ?? []), s.id])
    }
    for (const [detail, nodes] of byHeight) {
      divergences.push({ kind: 'height', nodes, detail })
    }
  } else if (!allSameHash) {
    const byHash = new Map<string, string[]>()
    for (const s of up) {
      const key = s.tipHash ?? '(sin hash)'
      byHash.set(key, [...(byHash.get(key) ?? []), s.id])
    }
    for (const [hash, nodes] of byHash) {
      divergences.push({
        kind: 'fork',
        nodes,
        detail: `misma altura (bloque #${up[0].tipIndex ?? up[0].ledgerHeight}) pero tip ${hash.slice(0, 12)}…`,
      })
    }
  }

  if (matching && downIds.length === 0) {
    return {
      kind: 'consistent',
      message: 'Ledger consistente en los 4 nodos',
      divergences: [],
      downIds,
    }
  }

  if (matching && downIds.length > 0) {
    return {
      kind: 'partial',
      message: `Los ${up.length} nodos en línea coinciden, pero no se puede afirmar consistencia de los 4: ${downIds.join(', ')} no responden.`,
      divergences: [],
      downIds,
    }
  }

  const fork = divergences.some((d) => d.kind === 'fork')
  return {
    kind: 'divergent',
    message: fork
      ? 'Fork: misma altura de ledger con hash de tip distinto'
      : 'Los nodos no coinciden en altura de ledger',
    divergences,
    downIds,
  }
}

export default function InfraPage() {
  const [snapshots, setSnapshots] = useState<NodeSnapshot[]>(() =>
    NODES.map((n) => ({
      id: n.id,
      label: n.label,
      url: n.url,
      hostPort: n.url.replace(/^https?:\/\//, ''),
      status: 'unknown' as NodeStatus,
      latencyMs: null,
      ledgerHeight: null,
      tipIndex: null,
      tipHash: null,
      tipTimestamp: null,
      isOrderer: Boolean(n.isOrderer),
      peers: [],
      chainValid: null,
      chainReason: null,
      error: null,
      lastSuccessAt: null,
      checkedAt: 0,
      raw: null,
      endpoint: 'GET /health',
    }))
  )
  const [now, setNow] = useState(() => Date.now())
  const [refreshing, setRefreshing] = useState(false)
  const [testsRunning, setTestsRunning] = useState(false)
  const [suite, setSuite] = useState<SuiteResult | null>(null)
  const [suiteError, setSuiteError] = useState<string | null>(null)
  const [suiteAvailable, setSuiteAvailable] = useState<boolean | null>(null)
  const [suiteHint, setSuiteHint] = useState<string | null>(null)
  const [copiedHash, setCopiedHash] = useState<string | null>(null)
  const snapshotsRef = useRef(snapshots)
  const testsRunningRef = useRef(false)

  snapshotsRef.current = snapshots
  testsRunningRef.current = testsRunning

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const prev: Record<string, NodeSnapshot> = {}
      for (const s of snapshotsRef.current) prev[s.id] = s
      const next = await pingAllNodes(NODES, prev)
      setSnapshots(next)
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    let cancelled = false
    fetch('/api/run-tests', { cache: 'no-store' })
      .then((res) => res.json())
      .then((body: { available?: boolean; error?: string; hint?: string }) => {
        if (cancelled) return
        setSuiteAvailable(body.available === true)
        setSuiteHint(
          body.available
            ? body.hint ?? null
            : body.error ??
              'La suite no corre dentro del contenedor dashboard. En el host: npm run test:seguridad'
        )
      })
      .catch(() => {
        if (!cancelled) {
          setSuiteAvailable(false)
          setSuiteHint('No se pudo consultar /api/run-tests.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (testsRunning) return
    const id = setInterval(() => {
      if (!testsRunningRef.current) void refresh()
    }, AUTO_REFRESH_MS)
    return () => clearInterval(id)
  }, [testsRunning, refresh])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const consistency = useMemo(() => buildConsistency(snapshots), [snapshots])
  const brokenChain = snapshots.filter((s) => s.chainValid === false)

  const orderer = snapshots.find((s) => s.id === ORDERER_ID) ?? snapshots.find((s) => s.isOrderer)
  const upCount = snapshots.filter((s) => s.status === 'up').length
  const quorumMet = upCount >= QUORUM_NODOS
  const ordererUp = orderer?.status === 'up'

  function heightDelta(node: NodeSnapshot): number | null {
    if (node.status !== 'up' || orderer?.status !== 'up') return null
    if (node.ledgerHeight == null || orderer.ledgerHeight == null) return null
    return node.ledgerHeight - orderer.ledgerHeight
  }

  async function copyHash(hash: string) {
    try {
      await navigator.clipboard.writeText(hash)
      setCopiedHash(hash)
      setTimeout(() => setCopiedHash((current) => (current === hash ? null : current)), 1500)
    } catch {
      setCopiedHash(null)
    }
  }

  async function runTests() {
    if (testsRunning) return
    setTestsRunning(true)
    setSuiteError(null)
    try {
      const res = await fetch('/api/run-tests', { method: 'POST', cache: 'no-store' })
      const body = (await res.json()) as SuiteResult & { error?: string }
      if (!res.ok && !body.stdout) {
        setSuiteError(body.error || `HTTP ${res.status} ${res.statusText}`)
        setSuite(null)
        return
      }
      setSuite(body)
      if (body.error && !body.total) setSuiteError(body.error)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setSuiteError(message)
      setSuite(null)
    } finally {
      setTestsRunning(false)
      void refresh()
    }
  }

  const bannerClass =
    consistency.kind === 'consistent'
      ? 'border-emerald-500/50 bg-emerald-950/60 text-emerald-100'
      : consistency.kind === 'divergent'
        ? 'border-red-500/60 bg-red-950/70 text-red-100'
        : consistency.kind === 'partial'
          ? 'border-amber-400/50 bg-amber-950/50 text-amber-100'
          : 'border-zinc-600 bg-zinc-900 text-zinc-200'

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans text-base">
      <header className="border-b border-zinc-800 bg-zinc-950/90 sticky top-0 z-10">
        <div className="mx-auto max-w-7xl px-4 py-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">INTEGRA · infraestructura</p>
            <h1 className="text-2xl font-semibold tracking-tight">Salud de la red</h1>
            <p className="text-sm text-zinc-400 mt-1">
              Nodos, quorum y consistencia del ledger. Los casos clínicos están en Consulta.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard"
              className="rounded-md border border-zinc-600 bg-zinc-900 px-4 py-2.5 text-base hover:bg-zinc-800"
            >
              Consulta clínica
            </Link>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={refreshing || testsRunning}
              className="inline-flex items-center gap-2 rounded-md border border-zinc-600 bg-zinc-900 px-4 py-2.5 text-base hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Actualizando…' : 'Actualizar'}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 space-y-6">
        <section
          className={`rounded-lg border px-5 py-4 ${bannerClass}`}
          role="status"
          aria-live="polite"
        >
          <p className="flex items-center gap-2 text-lg font-medium">
            {consistency.kind === 'consistent' && <CheckCircle2 className="h-5 w-5" />}
            {consistency.kind === 'divergent' && <XCircle className="h-5 w-5" />}
            {consistency.kind === 'partial' && <AlertTriangle className="h-5 w-5" />}
            {consistency.message}
          </p>
          {consistency.divergences.length > 0 && (
            <ul className="mt-2 space-y-1 text-base">
              {consistency.divergences.map((d, i) => (
                <li key={i}>
                  <span className="font-semibold">{d.kind === 'fork' ? 'Cadenas distintas' : 'Altura distinta'}:</span>{' '}
                  {d.nodes.join(', ')} — {d.detail}
                </li>
              ))}
            </ul>
          )}
        </section>

        {brokenChain.length > 0 && (
          <section className="rounded-lg border border-red-500/60 bg-red-950/70 text-red-100 px-5 py-4" role="alert">
            <p className="flex items-center gap-2 text-lg font-medium">
              <ShieldAlert className="h-5 w-5" />
              Integridad rota: el hash de al menos un bloque no coincide con su contenido
            </p>
            <ul className="mt-2 space-y-1 text-base">
              {brokenChain.map((n) => (
                <li key={n.id}>
                  {n.label}: {n.chainReason ?? 'cadena inválida'}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div
            className={`rounded-lg border px-5 py-4 ${
              quorumMet ? 'border-emerald-500/40 bg-emerald-950/30' : 'border-red-500/40 bg-red-950/30'
            }`}
          >
            <p className="text-xs uppercase tracking-wide text-zinc-400">Quorum</p>
            <p className="text-2xl font-semibold mt-1">
              {upCount}/{TOTAL_NODOS}
            </p>
            <p className="text-sm text-zinc-400 mt-1">
              {quorumMet ? 'Suficiente para confirmar bloques' : `Se necesitan ${QUORUM_NODOS} nodos en línea`}
            </p>
          </div>
          <div
            className={`rounded-lg border px-5 py-4 ${
              ordererUp ? 'border-sky-500/40 bg-sky-950/30' : 'border-red-500/40 bg-red-950/30'
            }`}
          >
            <p className="text-xs uppercase tracking-wide text-zinc-400">Coordinador</p>
            <p className="text-2xl font-semibold mt-1">{orderer?.label ?? 'Coordinador Nacional'}</p>
            <p className="text-sm text-zinc-400 mt-1">
              {ordererUp
                ? `${orderer?.ledgerHeight ?? '—'} bloques · ${orderer?.latencyMs ?? '—'} ms`
                : 'Sin señal: la red no puede ordenar bloques'}
            </p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-5 py-4">
            <p className="text-xs uppercase tracking-wide text-zinc-400">Último bloque</p>
            <p className="text-2xl font-mono mt-1">
              {orderer?.tipHash ? `${orderer.tipHash.slice(0, 10)}…` : '—'}
            </p>
            <p className="text-sm text-zinc-400 mt-1">{formatAgoIso(orderer?.tipTimestamp ?? null, now)}</p>
          </div>
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {snapshots.map((node) => {
            const meta = statusMeta(node.status)
            const hash = truncateHash(node.tipHash)
            const d = deltaLabel(heightDelta(node))
            return (
              <article
                key={node.id}
                className={`rounded-lg border bg-zinc-900/80 p-5 space-y-4 ${meta.ring}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <StatusIcon status={node.status} />
                    <div>
                      <h2 className="text-base font-semibold leading-tight">{node.label}</h2>
                      {node.isOrderer && (
                        <p className="text-xs uppercase tracking-wide text-sky-300 mt-1">Coordinador</p>
                      )}
                    </div>
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${meta.badge}`}>
                    {meta.label}
                  </span>
                </div>

                <p className="text-3xl font-semibold tabular-nums">
                  {node.ledgerHeight != null ? node.ledgerHeight : '—'}
                  <span className="ml-1 text-sm font-normal text-zinc-500">bloques</span>
                </p>

                <dl className="space-y-2 text-base">
                  <div className="flex justify-between gap-2">
                    <dt className="text-zinc-500">Sincronía</dt>
                    <dd className={`text-right ${d.className}`}>{d.text}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-zinc-500">Latencia</dt>
                    <dd className={`text-right ${latencyClass(node.latencyMs)}`}>
                      {node.latencyMs != null ? `${node.latencyMs} ms` : '—'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-zinc-500">Huella</dt>
                    <dd className="font-mono text-sm text-right">
                      {hash ? (
                        <button
                          type="button"
                          title={hash.full}
                          onClick={() => void copyHash(hash.full)}
                          className="cursor-pointer decoration-dotted underline underline-offset-2 hover:text-white"
                        >
                          {copiedHash === hash.full ? 'copiado' : hash.short}
                        </button>
                      ) : (
                        '—'
                      )}
                    </dd>
                  </div>
                  <Row label="Último bloque" value={formatAgoIso(node.tipTimestamp, now)} />
                  <div className="flex justify-between gap-2">
                    <dt className="text-zinc-500">Cadena</dt>
                    <dd
                      className={`text-right ${
                        node.chainValid === false
                          ? 'text-red-300'
                          : node.ledgerHeight === 0
                            ? 'text-zinc-500'
                            : node.chainValid === true
                              ? 'text-emerald-300'
                              : 'text-zinc-500'
                      }`}
                    >
                      {node.chainValid === false
                        ? 'rota'
                        : node.ledgerHeight === 0
                          ? 'sin bloques'
                          : node.chainValid === true
                            ? 'íntegra'
                            : '—'}
                    </dd>
                  </div>
                </dl>

                {node.error && (
                  <p className="text-sm text-red-300 bg-red-950/50 border border-red-900/60 rounded p-2 break-words">
                    {node.error}
                  </p>
                )}
              </article>
            )
          })}
        </section>

        <section className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Verificación de la red</h2>
              <p className="text-sm text-zinc-400">
                Suite de seguridad (identidad, endorsement, IoT, acceso, quorum). A1–A8 también:
                <span className="font-mono text-zinc-300"> bash scripts/setup-demo-attack-scenarios.sh all</span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => void runTests()}
              disabled={testsRunning || suiteAvailable === false}
              className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2.5 text-base font-medium text-white hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {testsRunning && (
                <span
                  className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin"
                  aria-hidden
                />
              )}
              {testsRunning ? 'Verificando…' : 'Ejecutar verificación'}
            </button>
          </div>

          {testsRunning && (
            <p className="text-base text-zinc-300" aria-live="polite">
              La suite tiene 20 pruebas y puede tardar un par de minutos.
            </p>
          )}

          <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 text-sm">
            {ATTACK_DEMOS.map((a) => {
              const outcome = attackOutcome(suite?.tests, a.tests)
              const cls =
                outcome === 'pass'
                  ? 'border-emerald-700/50 bg-emerald-950/40 text-emerald-100'
                  : outcome === 'fail'
                    ? 'border-red-700/50 bg-red-950/40 text-red-100'
                    : outcome === 'skip'
                      ? 'border-amber-700/50 bg-amber-950/30 text-amber-100'
                      : 'border-zinc-800 bg-zinc-950/40 text-zinc-300'
              const mark = outcome === 'pass' ? '✓' : outcome === 'fail' ? '✘' : outcome === 'skip' ? '↷' : '·'
              return (
                <li key={a.id} className={`rounded border px-3 py-2 ${cls}`}>
                  <p className="font-semibold">
                    {mark} {a.id}
                  </p>
                  <p className="text-zinc-400 mt-0.5 leading-snug">{a.title}</p>
                </li>
              )
            })}
            <li
              className={`rounded border px-3 py-2 ${
                brokenChain.length > 0
                  ? 'border-red-700/50 bg-red-950/40 text-red-100'
                  : snapshots.some((s) => s.chainValid === true)
                    ? 'border-emerald-700/50 bg-emerald-950/40 text-emerald-100'
                    : 'border-zinc-800 bg-zinc-950/40 text-zinc-300'
              }`}
            >
              <p className="font-semibold">
                {brokenChain.length > 0 ? '✘' : snapshots.some((s) => s.chainValid === true) ? '✓' : '·'} A9
              </p>
              <p className="text-zinc-400 mt-0.5 leading-snug">
                {brokenChain.length > 0 ? 'Cadena rota' : 'Cadena de hashes'}
              </p>
            </li>
          </ul>

          {suiteHint && suiteAvailable === false && (
            <p className="text-base text-amber-100 bg-amber-950/50 border border-amber-500/40 rounded p-3">
              La verificación no está disponible en este entorno.
            </p>
          )}

          {suiteError && (
            <p className="text-base text-red-300 bg-red-950/40 border border-red-900 rounded p-3 break-words">
              {suiteError}
            </p>
          )}

          {suite && (
            <div className="space-y-3">
              <p className={`text-xl font-semibold ${suite.ok ? 'text-emerald-300' : 'text-red-300'}`}>
                {suite.total > 0
                  ? `${suite.passed}/${suite.total} correctas`
                  : suite.timedOut
                    ? 'Tiempo agotado'
                    : 'Sin resumen'}
                {suite.skipped ? (
                  <span className="ml-2 text-base font-normal text-amber-200">({suite.skipped} saltados)</span>
                ) : null}
                {suite.durationMs != null && (
                  <span className="ml-2 text-base font-normal text-zinc-400">
                    ({Math.round(suite.durationMs / 1000)}s)
                  </span>
                )}
              </p>


              {(suite.tests?.length ?? 0) > 0 && (
                <ul className="space-y-1 text-sm max-h-80 overflow-auto rounded border border-zinc-800 bg-zinc-950/50 p-2">
                  {suite.tests!.map((t) => (
                    <li key={t.name} className="flex items-start gap-2 px-2 py-1.5">
                      {t.skipped ? (
                        <MinusCircle className="h-4 w-4 mt-0.5 shrink-0 text-amber-300" />
                      ) : t.passed ? (
                        <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-emerald-400" />
                      ) : (
                        <XCircle className="h-4 w-4 mt-0.5 shrink-0 text-red-400" />
                      )}
                      <div className="min-w-0">
                        <p className="font-medium text-zinc-100">{t.name}</p>
                        {t.detail && <p className="text-zinc-400 break-words">{t.detail}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {!suite.tests?.length && suite.failed?.length > 0 && (
                <div>
                  <h3 className="text-base font-medium text-red-200 mb-1">Fallos</h3>
                  <ul className="space-y-1 text-base">
                    {suite.failed.map((t, i) => (
                      <li key={`${t.name}-${i}`} className="rounded bg-red-950/40 border border-red-900/50 px-3 py-2">
                        <span className="font-medium text-red-100">{t.name}</span>
                        {t.detail && <p className="text-sm text-red-200/90 mt-0.5 break-words">{t.detail}</p>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-zinc-500">{label}</dt>
      <dd className={`text-right ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
    </div>
  )
}
