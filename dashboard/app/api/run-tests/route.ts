import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { NextRequest, NextResponse } from 'next/server'
import { rejectUnlessLocalhost } from '../_lib/localhost'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 180

/** La suite incluye waitForStack (hasta 60s) y tests que bajan/suben containers. */
const TEST_TIMEOUT_MS = 180_000
const OUTPUT_LIMIT = 1_000_000

let runInProgress = false

function findRepoRoot(): string {
  const candidates = [path.resolve(process.cwd(), '..'), process.cwd()]
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'tests', 'run-tests.js'))) return dir
  }
  throw new Error(
    `No se encontró tests/run-tests.js. cwd=${process.cwd()}. Ejecutá el dashboard desde dashboard/ (npm run dev).`
  )
}

function parseSuiteOutput(stdout: string, stderr: string, exitCode: number | null) {
  const combined = `${stdout}\n${stderr}`
  const summary = combined.match(/Total:\s+(\d+)\/(\d+)\s+PASS/)
  const passed = summary ? Number(summary[1]) : 0
  const total = summary ? Number(summary[2]) : 0

  const failed: Array<{ name: string; detail: string }> = []
  const failSection = combined.split('Tests Fallidos:')[1]
  if (failSection) {
    const re = /✘\s+(.+?):\s+(.*)$/gm
    let match: RegExpExecArray | null
    while ((match = re.exec(failSection)) !== null) {
      failed.push({ name: match[1].trim(), detail: match[2].trim() })
    }
  }

  if (failed.length === 0) {
    const re = /^✘\s+(\S+)\s+—\s+(.*)$/gm
    let match: RegExpExecArray | null
    while ((match = re.exec(combined)) !== null) {
      failed.push({ name: match[1].trim(), detail: match[2].trim() })
    }
  }

  const stackError = combined.match(/✘ ERROR:\s*(.*)/)
  if (stackError && total === 0) {
    failed.push({ name: 'stack', detail: stackError[1].trim() })
  }

  return {
    passed,
    total,
    failed,
    allPassed: exitCode === 0 && total > 0 && failed.length === 0,
  }
}

function runSuite(repoRoot: string): Promise<{
  stdout: string
  stderr: string
  exitCode: number | null
  timedOut: boolean
  durationMs: number
}> {
  const scriptPath = path.join(repoRoot, 'tests', 'run-tests.js')

  return new Promise((resolve, reject) => {
    const started = Date.now()
    const child = spawn(process.execPath, [scriptPath], {
      cwd: repoRoot,
      env: { ...process.env },
      windowsHide: true,
    })

    let stdout = ''
    let stderr = ''
    let timedOut = false
    let settled = false

    const append = (target: 'stdout' | 'stderr', chunk: Buffer) => {
      const text = chunk.toString('utf8')
      if (target === 'stdout') {
        if (stdout.length < OUTPUT_LIMIT) stdout += text.slice(0, OUTPUT_LIMIT - stdout.length)
      } else if (stderr.length < OUTPUT_LIMIT) {
        stderr += text.slice(0, OUTPUT_LIMIT - stderr.length)
      }
    }

    const finish = (exitCode: number | null) => {
      if (settled) return
      settled = true
      clearTimeout(killer)
      resolve({
        stdout,
        stderr,
        exitCode,
        timedOut,
        durationMs: Date.now() - started,
      })
    }

    const killer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
      setTimeout(() => {
        if (!settled) child.kill('SIGKILL')
      }, 5_000)
    }, TEST_TIMEOUT_MS)

    child.stdout.on('data', (chunk: Buffer) => append('stdout', chunk))
    child.stderr.on('data', (chunk: Buffer) => append('stderr', chunk))
    child.on('error', (err) => {
      clearTimeout(killer)
      if (!settled) {
        settled = true
        reject(err)
      }
    })
    child.on('close', (code) => finish(code))
  })
}

/**
 * POST /api/run-tests
 * Ejecuta `node tests/run-tests.js` (equivalente a `npm run test:seguridad`).
 * spawn con argv fijos — nunca exec con string interpolado.
 * Solo localhost. Un solo run a la vez.
 */
export async function POST(request: NextRequest) {
  const denied = rejectUnlessLocalhost(request)
  if (denied) return denied

  if (runInProgress) {
    return NextResponse.json(
      { ok: false, error: 'Ya hay una suite en ejecución. Esperá a que termine.' },
      { status: 409 }
    )
  }

  let repoRoot: string
  try {
    repoRoot = findRepoRoot()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }

  runInProgress = true
  try {
    const result = await runSuite(repoRoot)
    const parsed = parseSuiteOutput(result.stdout, result.stderr, result.exitCode)

    if (result.timedOut) {
      return NextResponse.json({
        ok: false,
        timedOut: true,
        error: `La suite superó el timeout de ${TEST_TIMEOUT_MS / 1000}s y fue abortada.`,
        command: 'node tests/run-tests.js',
        ...parsed,
        ...result,
      })
    }

    return NextResponse.json({
      ok: parsed.allPassed,
      timedOut: false,
      command: 'node tests/run-tests.js',
      ...parsed,
      ...result,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { ok: false, error: `No se pudo lanzar la suite: ${message}` },
      { status: 500 }
    )
  } finally {
    runInProgress = false
  }
}

export async function GET(request: NextRequest) {
  const denied = rejectUnlessLocalhost(request)
  if (denied) return denied
  return NextResponse.json(
    { ok: false, error: 'Usá POST para ejecutar la suite.' },
    { status: 405 }
  )
}
