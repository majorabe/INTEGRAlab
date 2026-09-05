import { NextRequest, NextResponse } from 'next/server'

const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '0:0:0:0:0:0:0:1'])

function normalizeHost(value: string): string {
  let v = value.trim().toLowerCase()
  if (v.startsWith('[')) {
    const end = v.indexOf(']')
    if (end !== -1) v = v.slice(1, end)
  } else {
    const colonCount = (v.match(/:/g) || []).length
    if (colonCount === 1) {
      v = v.split(':')[0]
    }
  }
  if (v.startsWith('::ffff:')) {
    v = v.slice('::ffff:'.length)
  }
  return v
}

/** 127/8, 10/8, 172.16/12, 192.168/16 — p.ej. gateway Docker 172.19.0.1 */
function isLoopbackOrPrivateIpv4(host: string): boolean {
  if (LOOPBACK.has(host)) return true
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (!m) return false
  const a = Number(m[1])
  const b = Number(m[2])
  if (a === 127) return true
  if (a === 10) return true
  if (a === 192 && b === 168) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  return false
}

/**
 * Rechaza cualquier request que no venga de loopback.
 * Este helper protege rutas que ejecutan comandos del sistema o sondean
 * la red interna: no deben quedar accesibles si el dashboard se despliega.
 */
export function rejectUnlessLocalhost(request: NextRequest): NextResponse | null {
  const urlHost = normalizeHost(request.nextUrl.hostname)
  if (!LOOPBACK.has(urlHost)) {
    return NextResponse.json(
      {
        ok: false,
        error: `Rechazado: el host '${request.nextUrl.hostname}' no es localhost. Esta ruta solo acepta requests locales de desarrollo.`,
      },
      { status: 403 }
    )
  }

  const hostHeader = request.headers.get('host')
  if (!hostHeader || !LOOPBACK.has(normalizeHost(hostHeader))) {
    return NextResponse.json(
      {
        ok: false,
        error: `Rechazado: el header Host (${hostHeader ?? 'vacío'}) no es localhost.`,
      },
      { status: 403 }
    )
  }

  // El browser entra por localhost:3000; Docker pone el gateway del bridge
  // (p.ej. ::ffff:172.19.0.1) en x-forwarded-for. Eso no es loopback, pero
  // tampoco es un deploy público: Host ya se validó como localhost.
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0].trim()
    const hop = first ? normalizeHost(first) : ''
    if (hop && !isLoopbackOrPrivateIpv4(hop)) {
      return NextResponse.json(
        {
          ok: false,
          error: `Rechazado: x-forwarded-for '${first}' no es loopback ni red privada (Docker).`,
        },
        { status: 403 }
      )
    }
  }

  const forwardedHost = request.headers.get('x-forwarded-host')
  if (forwardedHost) {
    const first = forwardedHost.split(',')[0].trim()
    if (first && !LOOPBACK.has(normalizeHost(first))) {
      return NextResponse.json(
        {
          ok: false,
          error: `Rechazado: x-forwarded-host '${forwardedHost}' no es localhost.`,
        },
        { status: 403 }
      )
    }
  }

  return null
}
