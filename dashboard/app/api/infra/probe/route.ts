import { NextRequest, NextResponse } from 'next/server'
import { NODES, HEALTH_PATH, FETCH_TIMEOUT_MS } from '../../../infra/nodes.config'
import { rejectUnlessLocalhost } from '../../_lib/localhost'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/infra/probe?id=<node-id>
 *
 * Fetch server-side al /health del nodo. El navegador no expone ECONNREFUSED
 * ni distingue CORS de puerto cerrado; este probe sí.
 * Solo acepta ids de nodes.config.ts (no URLs arbitrarias → evita SSRF).
 * Solo localhost.
 */
export async function GET(request: NextRequest) {
  const denied = rejectUnlessLocalhost(request)
  if (denied) return denied

  const id = request.nextUrl.searchParams.get('id')
  const node = NODES.find((n) => n.id === id)
  if (!node) {
    return NextResponse.json(
      { ok: false, error: `Nodo desconocido: ${id ?? '(vacío)'}. Ids válidos: ${NODES.map((n) => n.id).join(', ')}` },
      { status: 400 }
    )
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const res = await fetch(`${node.url}${HEALTH_PATH}`, {
      signal: controller.signal,
      cache: 'no-store',
    })
    return NextResponse.json({
      ok: true,
      reachable: true,
      httpStatus: res.status,
      statusText: res.statusText,
    })
  } catch (err) {
    const e = err as Error & { cause?: { code?: string; message?: string } }
    const code = e.cause?.code ?? ''
    let error: string

    if (e.name === 'AbortError' || e.name === 'TimeoutError') {
      error = `timeout ${FETCH_TIMEOUT_MS}ms (el nodo no respondió desde el servidor)`
    } else if (code === 'ECONNREFUSED') {
      error = `ECONNREFUSED — ${node.url} no acepta conexiones (nodo caído o puerto cerrado)`
    } else if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
      error = `${code} — no se resolvió el host de ${node.url}`
    } else if (code === 'ECONNRESET') {
      error = `ECONNRESET — ${node.url} cortó la conexión`
    } else if (code) {
      error = `${code} — ${e.cause?.message || e.message}`
    } else {
      error = e.cause?.message || e.message
    }

    return NextResponse.json({
      ok: true,
      reachable: false,
      error,
      code: code || null,
    })
  } finally {
    clearTimeout(timer)
  }
}
