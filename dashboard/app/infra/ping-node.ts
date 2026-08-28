import { FETCH_TIMEOUT_MS, HEALTH_PATH, type InfraNode } from './nodes.config'

export type NodeStatus = 'up' | 'down' | 'timeout' | 'reject' | 'unknown'

export interface HealthPayload {
  org?: string
  status?: string
  peers?: string[]
  isOrderer?: boolean
  ledgerHeight?: number
  tipIndex?: number | null
  tipHash?: string | null
  tipTimestamp?: string | null
  timestamp?: string
  [key: string]: unknown
}

export interface NodeSnapshot {
  id: string
  label: string
  url: string
  hostPort: string
  status: NodeStatus
  latencyMs: number | null
  ledgerHeight: number | null
  tipIndex: number | null
  tipHash: string | null
  tipTimestamp: string | null
  isOrderer: boolean
  peers: string[]
  error: string | null
  lastSuccessAt: number | null
  checkedAt: number
  raw: unknown
  endpoint: string
}

interface ProbeResponse {
  ok?: boolean
  reachable?: boolean
  httpStatus?: number
  error?: string
  code?: string | null
}

function hostPort(url: string): string {
  try {
    const u = new URL(url)
    return `${u.hostname}:${u.port || (u.protocol === 'https:' ? '443' : '80')}`
  } catch {
    return url
  }
}

function emptySnapshot(node: InfraNode, extras: Partial<NodeSnapshot>): NodeSnapshot {
  return {
    id: node.id,
    label: node.label,
    url: node.url,
    hostPort: hostPort(node.url),
    status: 'unknown',
    latencyMs: null,
    ledgerHeight: null,
    tipIndex: null,
    tipHash: null,
    tipTimestamp: null,
    isOrderer: Boolean(node.isOrderer),
    peers: [],
    error: null,
    lastSuccessAt: null,
    checkedAt: Date.now(),
    raw: null,
    endpoint: `GET ${HEALTH_PATH}`,
    ...extras,
  }
}

async function classifyBrowserFailure(node: InfraNode, browserError: Error): Promise<string> {
  try {
    const res = await fetch(`/api/infra/probe?id=${encodeURIComponent(node.id)}`, {
      cache: 'no-store',
    })
    const probe = (await res.json()) as ProbeResponse
    if (!res.ok) {
      return `${browserError.message} (probe HTTP ${res.status}: ${probe.error ?? res.statusText})`
    }
    if (probe.reachable) {
      return `CORS blocked — el nodo responde en ${node.url} (HTTP ${probe.httpStatus}) pero el navegador bloqueó el fetch. Falta Access-Control-Allow-Origin para el origen de este dashboard.`
    }
    return probe.error || browserError.message
  } catch (probeErr) {
    const extra = probeErr instanceof Error ? probeErr.message : String(probeErr)
    return `${browserError.message} (no se pudo clasificar vía probe: ${extra})`
  }
}

function extractLedger(payload: HealthPayload | null, node: InfraNode): {
  ledgerHeight: number | null
  tipIndex: number | null
  tipHash: string | null
  tipTimestamp: string | null
  isOrderer: boolean
  peers: string[]
} {
  if (!payload || typeof payload !== 'object') {
    return {
      ledgerHeight: null,
      tipIndex: null,
      tipHash: null,
      tipTimestamp: null,
      isOrderer: Boolean(node.isOrderer),
      peers: [],
    }
  }
  const ledgerHeight = typeof payload.ledgerHeight === 'number' ? payload.ledgerHeight : null
  const tipIndex = typeof payload.tipIndex === 'number' ? payload.tipIndex : null
  const tipHash = typeof payload.tipHash === 'string' && payload.tipHash.length > 0 ? payload.tipHash : null
  const tipTimestamp =
    typeof payload.tipTimestamp === 'string' && payload.tipTimestamp.length > 0 ? payload.tipTimestamp : null
  const isOrderer = typeof payload.isOrderer === 'boolean' ? payload.isOrderer : Boolean(node.isOrderer)
  const peers = Array.isArray(payload.peers) ? payload.peers.filter((p): p is string => typeof p === 'string') : []
  return { ledgerHeight, tipIndex, tipHash, tipTimestamp, isOrderer, peers }
}

export async function pingNode(
  node: InfraNode,
  previous: NodeSnapshot | null
): Promise<NodeSnapshot> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  const started = performance.now()

  try {
    const res = await fetch(`${node.url}${HEALTH_PATH}`, {
      method: 'GET',
      signal: controller.signal,
      cache: 'no-store',
      mode: 'cors',
    })
    const latencyMs = Math.round(performance.now() - started)
    const text = await res.text()
    let payload: HealthPayload | null = null
    try {
      payload = JSON.parse(text) as HealthPayload
    } catch {
      payload = null
    }

    if (!res.ok) {
      const bodyPreview = text.slice(0, 300)
      return emptySnapshot(node, {
        status: 'reject',
        latencyMs,
        error: `HTTP ${res.status} ${res.statusText}${bodyPreview ? `: ${bodyPreview}` : ''} — el nodo responde pero rechaza`,
        lastSuccessAt: previous?.lastSuccessAt ?? null,
        raw: payload ?? text,
      })
    }

    const ledger = extractLedger(payload, node)
    return emptySnapshot(node, {
      status: 'up',
      latencyMs,
      ...ledger,
      error: null,
      lastSuccessAt: Date.now(),
      raw: payload ?? text,
    })
  } catch (err) {
    const latencyMs = Math.round(performance.now() - started)
    const e = err instanceof Error ? err : new Error(String(err))

    if (e.name === 'AbortError' || e.name === 'TimeoutError') {
      return emptySnapshot(node, {
        status: 'timeout',
        latencyMs,
        error: `timeout ${FETCH_TIMEOUT_MS}ms — ${node.url}${HEALTH_PATH} no respondió a tiempo`,
        lastSuccessAt: previous?.lastSuccessAt ?? null,
        raw: { name: e.name, message: e.message },
      })
    }

    const classified = await classifyBrowserFailure(node, e)
    return emptySnapshot(node, {
      status: 'down',
      latencyMs,
      error: classified,
      lastSuccessAt: previous?.lastSuccessAt ?? null,
      raw: { name: e.name, message: e.message },
    })
  } finally {
    clearTimeout(timer)
  }
}

export async function pingAllNodes(
  nodes: InfraNode[],
  previousById: Record<string, NodeSnapshot>
): Promise<NodeSnapshot[]> {
  return Promise.all(nodes.map((node) => pingNode(node, previousById[node.id] ?? null)))
}
