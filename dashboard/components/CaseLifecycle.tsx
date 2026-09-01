'use client'

import { CaseState, TelemetryReading } from '@/lib/types'

type PhaseId = 'empty' | 'registered' | 'waiting' | 'assigned' | 'in-transit' | 'alert'

const PHASES: Array<{ id: Exclude<PhaseId, 'empty' | 'alert'>; label: string; hint: string }> = [
  { id: 'registered', label: 'Donante', hint: 'donor-registry' },
  { id: 'waiting', label: 'Lista de espera', hint: 'waiting-list' },
  { id: 'assigned', label: 'Asignación', hint: 'assignment' },
  { id: 'in-transit', label: 'En tránsito', hint: 'custody / IoT' },
]

export function casePhase(state: CaseState | null, telemetry: TelemetryReading[] = []): PhaseId {
  if (!state) return 'empty'
  const alerts = telemetry.filter((r) => r.fueraDeRango).length
  if (alerts > 0) return 'alert'
  if (telemetry.length > 0 || (state.custodyCheckpoints?.length ?? 0) > 0) return 'in-transit'
  if (state.assignmentInfo) return 'assigned'
  if (state.recipientInfo) return 'waiting'
  if (state.donorInfo) return 'registered'
  return 'empty'
}

export function CaseLifecycle({
  state,
  telemetry = [],
}: {
  state: CaseState | null
  telemetry?: TelemetryReading[]
}) {
  const phase = casePhase(state, telemetry)
  const reached: Record<string, boolean> = {
    registered: !!state?.donorInfo,
    waiting: !!state?.recipientInfo,
    assigned: !!state?.assignmentInfo,
    'in-transit': telemetry.length > 0 || (state?.custodyCheckpoints?.length ?? 0) > 0,
  }

  const copy: Record<PhaseId, string> = {
    empty: 'Este ID no tiene hechos en el ledger todavía.',
    registered: 'Hay un donante. Falta lista de espera y asignación para iniciar el traslado.',
    waiting: 'Hay donante y paciente. Falta assignment (decisión clínica) para iniciar trazabilidad.',
    assigned: 'Órgano asignado. La telemetría IoT debería empezar a grabar bloques custody.',
    'in-transit': 'Contenedor en tránsito: cada lectura IoT es un bloque custody vinculado a este organId.',
    alert: 'Hay lecturas fuera de rango de frío en el ledger. Dato grabado, no estimado.',
  }

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Ciclo del caso en el ledger</p>
      <ol className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {PHASES.map((step, i) => {
          const on = reached[step.id]
          return (
            <li
              key={step.id}
              className={`rounded-md border px-3 py-2 ${
                on ? 'border-emerald-500/40 bg-emerald-950/20' : 'border-dashed opacity-70'
              }`}
            >
              <p className="text-[10px] text-muted-foreground">{i + 1}</p>
              <p className="text-sm font-medium">{step.label}</p>
              <p className="text-[10px] font-mono text-muted-foreground">{step.hint}</p>
            </li>
          )
        })}
      </ol>
      <p className={`text-sm ${phase === 'alert' ? 'text-destructive' : 'text-muted-foreground'}`}>{copy[phase]}</p>
    </div>
  )
}
