'use client'

/**
 * Panel de infraestructura INTEGRA — /infra
 *
 * Independiente del dashboard clínico: fetch nativo a cada nodo, sin
 * api-client.ts, sin routing por rol, sin CaseDetail/TelemetryChart/etc.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AUTO_REFRESH_MS, NODES, ORDERER_ID, QUORUM_NODOS, TOTAL_NODOS } from './nodes.config'
import { pingAllNodes, type NodeSnapshot, type NodeStatus } from './ping-node'

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
  stdout: string
  stderr: string
  exitCode: number | null
  durationMs: number
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

function peerName(peerUrl: string): string {
  try {
    return new URL(peerUrl).hostname
  } catch {
    return peerUrl
  }
}

function deltaLabel(delta: number | null): { text: string; className: string } {
  if (delta == null) return { text: '—', className: 'text-zinc-500' }
  if (delta === 0) return { text: 'al día', className: 'text-emerald-300' }
  if (delta < 0) return { text: `${Math.abs(delta)} atrás`, className: 'text-amber-300' }
  return { text: `+${delta} (adelantado al orderer)`, className: 'text-red-300' }
}

function latencyClass(ms: number | null): string {
  if (ms == null) return 'text-zinc-400'
  if (ms >= 1000) return 'text-red-300'
  if (ms >= 200) return 'text-amber-300'
  return 'text-zinc-200'
}

function statusMeta(status: NodeStatus): { emoji: string; label: string; ring: string; badge: string } {
  switch (status) {
    case 'up':
      return { emoji: '🟢', label: 'up', ring: 'border-emerald-500/60', badge: 'bg-emerald-500/15 text-emerald-300' }
    case 'timeout':
      return { emoji: '🟡', label: 'timeout', ring: 'border-amber-400/70', badge: 'bg-amber-400/15 text-amber-200' }
    case 'reject':
      return { emoji: '🟠', label: 'rechaza', ring: 'border-orange-400/70', badge: 'bg-orange-400/15 text-orange-200' }
    case 'down':
      return { emoji: '🔴', label: 'down', ring: 'border-red-500/70', badge: 'bg-red-500/15 text-red-300' }
    default:
      return { emoji: '⚪', label: '—', ring: 'border-zinc-700', badge: 'bg-zinc-700/40 text-zinc-300' }
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
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans">
      <header className="border-b border-zinc-800 bg-zinc-950/90 sticky top-0 z-10">
        <div className="mx-auto max-w-7xl px-4 py-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">INTEGRA · diagnóstico local</p>
            <h1 className="text-xl font-semibold tracking-tight">Panel de infraestructura</h1>
            <p className="text-xs text-zinc-400 mt-0.5">
              Fetch directo a GET /health · sin api-client · auto-refresh {AUTO_REFRESH_MS / 1000}s
              {testsRunning ? ' (pausado: tests en curso)' : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={refreshing || testsRunning}
            className="rounded-md border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {refreshing ? 'Actualizando…' : 'Actualizar ahora'}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 space-y-6">
        <section
          className={`rounded-lg border px-4 py-3 ${bannerClass}`}
          role="status"
          aria-live="polite"
        >
          <p className="font-medium">
            {consistency.kind === 'consistent' && '🟢 '}
            {consistency.kind === 'divergent' && '🔴 '}
            {consistency.kind === 'partial' && '🟡 '}
            {consistency.message}
          </p>
          {consistency.divergences.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm">
              {consistency.divergences.map((d, i) => (
                <li key={i}>
                  <span className="font-semibold">{d.kind === 'fork' ? 'Fork' : 'Altura distinta'}:</span>{' '}
                  {d.nodes.join(', ')} — {d.detail}
                </li>
              ))}
            </ul>
          )}
          {consistency.downIds.length > 0 && consistency.kind === 'divergent' && (
            <p className="mt-2 text-xs opacity-80">Sin datos de: {consistency.downIds.join(', ')}</p>
          )}
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div
            className={`rounded-lg border px-4 py-3 ${
              quorumMet ? 'border-emerald-500/40 bg-emerald-950/30' : 'border-red-500/40 bg-red-950/30'
            }`}
          >
            <p className="text-[11px] uppercase tracking-wide text-zinc-500">Quorum de replicación</p>
            <p className="text-lg font-semibold mt-1">
              {upCount}/{TOTAL_NODOS} up · umbral {QUORUM_NODOS}
            </p>
            <p className="text-xs text-zinc-400 mt-0.5">
              {quorumMet ? 'Quorum alcanzado: se pueden confirmar bloques' : 'Sin quorum: las escrituras deberían bloquearse'}
            </p>
          </div>
          <div
            className={`rounded-lg border px-4 py-3 ${
              ordererUp ? 'border-sky-500/40 bg-sky-950/30' : 'border-red-500/40 bg-red-950/30'
            }`}
          >
            <p className="text-[11px] uppercase tracking-wide text-zinc-500">Orderer</p>
            <p className="text-lg font-semibold mt-1">{ORDERER_ID}</p>
            <p className="text-xs text-zinc-400 mt-0.5">
              {ordererUp
                ? `altura ${orderer?.ledgerHeight ?? '—'} · ${orderer?.latencyMs ?? '—'} ms`
                : 'no responde — la red no puede ordenar bloques'}
            </p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-zinc-500">Tip del orderer</p>
            <p className="text-lg font-mono mt-1">
              {orderer?.tipHash ? `${orderer.tipHash.slice(0, 12)}…` : '—'}
            </p>
            <p className="text-xs text-zinc-400 mt-0.5">
              último bloque {formatAgoIso(orderer?.tipTimestamp ?? null, now)}
            </p>
          </div>
        </section>

        <section className="overflow-x-auto rounded-lg border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900 text-zinc-400 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left font-medium px-3 py-2">Nodo</th>
                <th className="text-left font-medium px-3 py-2">Estado</th>
                <th className="text-right font-medium px-3 py-2">Altura</th>
                <th className="text-right font-medium px-3 py-2">vs orderer</th>
                <th className="text-left font-medium px-3 py-2">Tip</th>
                <th className="text-right font-medium px-3 py-2">Latencia</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((node) => {
                const meta = statusMeta(node.status)
                const delta = heightDelta(node)
                const d = deltaLabel(delta)
                const hash = truncateHash(node.tipHash)
                return (
                  <tr key={node.id} className="border-t border-zinc-800">
                    <td className="px-3 py-2">
                      <span className="font-medium">{node.label}</span>
                      {node.isOrderer && (
                        <span className="ml-2 text-[10px] uppercase tracking-wide rounded bg-sky-500/20 text-sky-300 px-1.5 py-0.5">
                          orderer
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">{meta.emoji} {meta.label}</td>
                    <td className="px-3 py-2 text-right font-mono">
                      {node.ledgerHeight != null ? node.ledgerHeight : '—'}
                    </td>
                    <td className={`px-3 py-2 text-right ${d.className}`}>{d.text}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {hash ? (
                        <button
                          type="button"
                          title={hash.full}
                          onClick={() => void copyHash(hash.full)}
                          className="hover:text-white underline decoration-dotted underline-offset-2"
                        >
                          {copiedHash === hash.full ? 'copiado' : hash.short}
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className={`px-3 py-2 text-right font-mono ${latencyClass(node.latencyMs)}`}>
                      {node.latencyMs != null ? `${node.latencyMs} ms` : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {snapshots.map((node) => {
            const meta = statusMeta(node.status)
            const hash = truncateHash(node.tipHash)
            const d = deltaLabel(heightDelta(node))
            return (
              <article
                key={node.id}
                className={`rounded-lg border bg-zinc-900/80 p-4 space-y-3 ${meta.ring}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold leading-tight">{node.label}</h2>
                    <p className="text-xs font-mono text-zinc-400 mt-0.5">{node.id}</p>
                    {node.isOrderer && (
                      <p className="text-[10px] uppercase tracking-wide text-sky-300 mt-1">orderer</p>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${meta.badge}`}>
                    {meta.emoji} {meta.label}
                  </span>
                </div>

                <dl className="space-y-1.5 text-sm">
                  <Row label="Host:puerto" value={node.hostPort} mono />
                  <div className="flex justify-between gap-2">
                    <dt className="text-zinc-500">Latencia</dt>
                    <dd className={`text-right ${latencyClass(node.latencyMs)}`}>
                      {node.latencyMs != null ? `${node.latencyMs} ms` : '—'}
                    </dd>
                  </div>
                  <Row
                    label="Altura"
                    value={
                      node.status === 'up'
                        ? node.tipIndex != null
                          ? `bloque #${node.tipIndex}`
                          : node.ledgerHeight === 0
                            ? 'sin bloques'
                            : '—'
                        : '—'
                    }
                  />
                  <div className="flex justify-between gap-2">
                    <dt className="text-zinc-500">vs orderer</dt>
                    <dd className={`text-right text-xs ${d.className}`}>{d.text}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-zinc-500">Tip</dt>
                    <dd className="font-mono text-xs text-right">
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
                  <Row label="Último OK" value={formatAgo(node.lastSuccessAt, now)} />
                  {node.peers.length > 0 && (
                    <div>
                      <dt className="text-zinc-500 text-xs">Peers ({node.peers.length})</dt>
                      <dd className="text-[11px] font-mono text-zinc-400 mt-0.5 break-words">
                        {node.peers.map(peerName).join(', ')}
                      </dd>
                    </div>
                  )}
                </dl>

                {node.error && (
                  <p className="text-xs text-red-300 bg-red-950/50 border border-red-900/60 rounded p-2 break-words">
                    {node.error}
                  </p>
                )}

                <details className="text-xs">
                  <summary className="cursor-pointer text-zinc-400 hover:text-zinc-200">
                    JSON crudo · {node.endpoint}
                  </summary>
                  <pre className="mt-2 max-h-56 overflow-auto rounded bg-black/50 p-2 text-[11px] text-zinc-300">
                    {node.raw != null ? JSON.stringify(node.raw, null, 2) : 'sin respuesta'}
                  </pre>
                </details>
              </article>
            )
          })}
        </section>

        <section className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Suite de tests</h2>
              <p className="text-xs text-zinc-400">
                Ejecuta <code className="font-mono">node tests/run-tests.js</code> (test01–test19) en el servidor.
                El auto-refresh se pausa mientras corre.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void runTests()}
              disabled={testsRunning}
              className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {testsRunning && (
                <span
                  className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin"
                  aria-hidden
                />
              )}
              {testsRunning ? 'Ejecutando…' : 'Correr tests'}
            </button>
          </div>

          {testsRunning && (
            <p className="text-sm text-zinc-300" aria-live="polite">
              Ejecutando la suite… esto puede tardar un par de minutos (incluye waitForStack y tests que bajan nodos).
            </p>
          )}

          {suiteError && (
            <p className="text-sm text-red-300 bg-red-950/40 border border-red-900 rounded p-3 break-words">
              {suiteError}
            </p>
          )}

          {suite && (
            <div className="space-y-3">
              <p className={`text-lg font-semibold ${suite.ok ? 'text-emerald-300' : 'text-red-300'}`}>
                {suite.total > 0 ? `${suite.passed}/${suite.total} passed` : suite.timedOut ? 'Timeout' : 'Sin resumen'}
                {suite.durationMs != null && (
                  <span className="ml-2 text-sm font-normal text-zinc-400">
                    ({Math.round(suite.durationMs / 1000)}s
                    {suite.exitCode != null ? `, exit ${suite.exitCode}` : ''})
                  </span>
                )}
              </p>

              {suite.failed?.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-red-200 mb-1">Tests fallidos</h3>
                  <ul className="space-y-1 text-sm">
                    {suite.failed.map((t, i) => (
                      <li key={`${t.name}-${i}`} className="rounded bg-red-950/40 border border-red-900/50 px-3 py-2">
                        <span className="font-mono text-red-100">{t.name}</span>
                        {t.detail && <p className="text-xs text-red-200/90 mt-0.5 break-words">{t.detail}</p>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <details className="text-xs">
                <summary className="cursor-pointer text-zinc-400 hover:text-zinc-200">
                  Output completo (stdout/stderr)
                </summary>
                <pre className="mt-2 max-h-96 overflow-auto rounded bg-black/60 p-3 text-[11px] text-zinc-300 whitespace-pre-wrap">
                  {suite.command ? `$ ${suite.command}\n\n` : ''}
                  {suite.stdout || '(stdout vacío)'}
                  {suite.stderr ? `\n\n--- stderr ---\n${suite.stderr}` : ''}
                </pre>
              </details>
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
