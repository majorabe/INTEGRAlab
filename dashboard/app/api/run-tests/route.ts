/**
 * Run tests API endpoint
 * Executes the security test suite and returns results
 */

import { NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export async function POST(request: NextRequest) {
  try {
    // This runs the backend test suite
    // Adjust path based on your setup
    const { stdout, stderr } = await execAsync(
      'cd nodes && npm run test:seguridad 2>&1',
      { timeout: 60000, maxBuffer: 10 * 1024 * 1024 }
    )

    const output = stdout + stderr

    // Parse test results
    const lines = output.split('\n')
    const passed = lines.filter((l) => l.includes('✓')).length
    const failed = lines.filter((l) => l.includes('✗')).length
    const total = passed + failed

    return NextResponse.json({
      ok: true,
      passed,
      failed,
      total,
      exitCode: 0,
      durationMs: Date.now(),
      stdout: output,
      stderr: '',
    })
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    return NextResponse.json(
      {
        ok: false,
        passed: 0,
        failed: 0,
        total: 0,
        exitCode: 1,
        error: error.message,
        stdout: '',
        stderr: error.message,
      },
      { status: 500 }
    )
  }
}
