/**
 * Suite de seguridad: `node tests/run-tests.js` en la raíz del repo.
 *
 * En Docker el repo se monta en INTEGRA_REPO_ROOT (/integralab). axios y
 * node-forge salen de NODE_PATH (imagen del dashboard + node_modules del host).
 */

import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { rejectUnlessLocalhost } from '../_lib/localhost'

interface SuiteTest {
  name: string
  passed: boolean
  skipped?: boolean
  detail: string
  ms?: number
}

function findRepoRoot(): string | null {
  const fromEnv = process.env.INTEGRA_REPO_ROOT
  if (fromEnv) {
    const suite = path.join(fromEnv, 'tests', 'run-tests.js')
    if (fs.existsSync(suite)) return fromEnv
  }
  const guesses = [path.resolve(process.cwd(), '..'), path.resolve(process.cwd())]
  for (const root of guesses) {
    const suite = path.join(root, 'tests', 'run-tests.js')
    const compose = path.join(root, 'docker-compose.yml')
    if (fs.existsSync(suite) && fs.existsSync(compose)) return root
  }
  return null
}

function parseSuiteOutput(output: string): {
  passed: number
  total: number
  skipped: number
  failed: Array<{ name: string; detail: string }>
  tests: SuiteTest[]
} {
  const marker = '__SUITE_JSON__'
  const idx = output.lastIndexOf(marker)
  if (idx >= 0) {
    const raw = output.slice(idx + marker.length).trim().split('\n')[0]
    try {
      const parsed = JSON.parse(raw) as {
        passed?: number
        total?: number
        skipped?: number
        failed?: Array<{ name: string; detail: string }>
        tests?: SuiteTest[]
      }
      const tests = parsed.tests ?? []
      const failed =
        parsed.failed ?? tests.filter((t) => !t.passed && !t.skipped).map((t) => ({ name: t.name, detail: t.detail }))
      const total = parsed.total ?? tests.length
      const skipped = parsed.skipped ?? tests.filter((t) => t.skipped).length
      const passed = parsed.passed ?? tests.filter((t) => t.passed && !t.skipped).length
      if (total > 0) return { passed, total, skipped, failed, tests }
    } catch {
      /* fallback below */
    }
  }

  const summary = output.match(/Total:\s*(\d+)\s*\/\s*(\d+)\s+PASS/)
  if (summary) {
    return {
      passed: Number(summary[1]),
      total: Number(summary[2]),
      skipped: 0,
      failed: [],
      tests: [],
    }
  }

  return { passed: 0, total: 0, skipped: 0, failed: [], tests: [] }
}

function nodePathFor(root: string): string {
  const parts = [
    '/app/node_modules',
    path.join(root, 'node_modules'),
    path.join(root, 'dashboard', 'node_modules'),
    process.env.NODE_PATH,
  ].filter((p): p is string => Boolean(p))
  return [...new Set(parts)].join(path.delimiter)
}

function unavailableBody() {
  return {
    ok: false,
    available: false,
    code: 'SUITE_NOT_IN_CONTAINER',
    passed: 0,
    failed: [] as Array<{ name: string; detail: string }>,
    tests: [] as SuiteTest[],
    total: 0,
    skipped: 0,
    exitCode: null,
    error:
      'No se encontró tests/run-tests.js. Si el dashboard corre en Docker, reconstruí: docker compose up --build -d dashboard. En el host: npm run test:seguridad',
    command: 'npm run test:seguridad',
    stdout: '',
    stderr: '',
  }
}

export async function GET() {
  const root = findRepoRoot()
  if (!root) {
    return NextResponse.json(unavailableBody())
  }
  return NextResponse.json({
    ok: true,
    available: true,
    command: 'npm run test:seguridad',
    hint: 'Ledger vacío es normal. Los tests no piden bloques previos. test16 y test19 se saltan dentro de Docker (hace falta el socket).',
  })
}

export async function POST(request: NextRequest) {
  const blocked = rejectUnlessLocalhost(request)
  if (blocked) return blocked

  const root = findRepoRoot()
  if (!root) {
    return NextResponse.json(unavailableBody(), { status: 409 })
  }

  const started = Date.now()
  const inCompose = root === '/integralab' || process.env.INTEGRA_REPO_ROOT === '/integralab'
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_PATH: nodePathFor(root),
  }
  if (inCompose) {
    childEnv.INTEGRA_NODES_HOST_MODE = process.env.INTEGRA_NODES_HOST_MODE || 'compose'
    childEnv.CERTS_DIR = process.env.CERTS_DIR || '/certs'
  }
  const child = spawn('node', ['tests/run-tests.js'], {
    cwd: root,
    env: childEnv,
  })

  let stdout = ''
  let stderr = ''
  child.stdout?.on('data', (chunk: Buffer) => {
    stdout += chunk.toString()
  })
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString()
  })

  const timeoutMs = 300000
  const result = await new Promise<{ code: number | null; timedOut: boolean }>((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      resolve({ code: null, timedOut: true })
    }, timeoutMs)
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, timedOut: false })
    })
    child.on('error', () => {
      clearTimeout(timer)
      resolve({ code: 1, timedOut: false })
    })
  })

  const output = stdout + stderr
  const parsed = parseSuiteOutput(output)

  return NextResponse.json({
    ok: !result.timedOut && result.code === 0,
    available: true,
    timedOut: result.timedOut,
    passed: parsed.passed,
    failed: parsed.failed,
    tests: parsed.tests,
    total: parsed.total,
    skipped: parsed.skipped,
    exitCode: result.code,
    durationMs: Date.now() - started,
    stdout: output,
    stderr,
    command: 'node tests/run-tests.js',
  })
}
