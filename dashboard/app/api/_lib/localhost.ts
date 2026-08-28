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

  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0].trim()
    if (first && !LOOPBACK.has(normalizeHost(first))) {
      return NextResponse.json(
        {
          ok: false,
          error: `Rechazado: x-forwarded-for '${first}' no es una dirección loopback.`,
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
