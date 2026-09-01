/**
 * Suite de seguridad: `node tests/run-tests.js` en la raíz del repo.
 *
 * No corre dentro de la imagen Docker del dashboard (no hay /tests ni /nodes).
 * Un ledger vacío no es un error: los tests escriben sus propias transacciones.
 */

import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { rejectUnlessLocalhost } from '../_lib/localhost'

function findRepoRoot(): string | null {
  const guesses = [path.resolve(process.cwd(), '..'), path.resolve(process.cwd())]
  for (const root of guesses) {
    const suite = path.join(root, 'tests', 'run-tests.js')
    const compose = path.join(root, 'docker-compose.yml')
    if (fs.existsSync(suite) && fs.existsSync(compose)) return root
  }
  return null
}

function unavailableBody() {
  return {
    ok: false,
    available: false,
    code: 'SUITE_NOT_IN_CONTAINER',
    passed: 0,
    failed: 0,
    total: 0,
    exitCode: null,
    error:
      'La suite no está en la imagen del dashboard. Un ledger vacío no impide los tests: ellos escriben sus propias txs (y algunos bajan nodos). En el host, desde la raíz del repo: npm run test:seguridad',
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
    hint: 'Ledger vacío es normal. Los tests no piden bloques previos.',
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
  const child = spawn('node', ['tests/run-tests.js'], {
    cwd: root,
    env: { ...process.env },
  })

  let stdout = ''
  let stderr = ''
  child.stdout?.on('data', (chunk: Buffer) => {
    stdout += chunk.toString()
  })
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString()
  })

  const timeoutMs = 180000
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
  const passed = output.split('\n').filter((l) => l.includes('✓') || l.includes('PASS')).length
  const failedLines = output.split('\n').filter((l) => l.includes('✗') || l.includes('FAIL'))

  return NextResponse.json({
    ok: !result.timedOut && result.code === 0,
    available: true,
    timedOut: result.timedOut,
    passed,
    failed: failedLines.length,
    total: passed + failedLines.length,
    exitCode: result.code,
    durationMs: Date.now() - started,
    stdout: output,
    stderr,
    command: 'node tests/run-tests.js',
  })
}
