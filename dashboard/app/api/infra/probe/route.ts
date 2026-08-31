/**
 * Diagnostics endpoint: check node reachability from server-side
 * Used by /infra to diagnose CORS issues
 */

import { NODES } from '@/app/infra/nodes.config'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const nodeId = request.nextUrl.searchParams.get('id')

  if (!nodeId) {
    return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 })
  }

  const node = NODES.find((n) => n.id === nodeId)
  if (!node) {
    return NextResponse.json({ error: 'Node not found' }, { status: 404 })
  }

  try {
    const startTime = Date.now()
    const response = await fetch(`${node.url}/health`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    })
    const elapsed = Date.now() - startTime

    if (!response.ok) {
      return NextResponse.json({
        reachable: false,
        httpStatus: response.status,
        error: `HTTP ${response.status} ${response.statusText}`,
      })
    }

    try {
      const data = await response.json()
      return NextResponse.json({
        reachable: true,
        httpStatus: 200,
        latencyMs: elapsed,
        data,
      })
    } catch {
      return NextResponse.json({
        reachable: true,
        httpStatus: 200,
        latencyMs: elapsed,
        error: 'Response not JSON',
      })
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    return NextResponse.json({
      reachable: false,
      error,
    })
  }
}
