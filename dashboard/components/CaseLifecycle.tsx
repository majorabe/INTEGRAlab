'use client'

import { Building2, HeartPulse, Link2, Truck, Users } from 'lucide-react'
import { CaseState, TelemetryReading } from '@/lib/types'

type PhaseId = 'empty' | 'registered' | 'waiting' | 'assigned' | 'in-transit' | 'received' | 'alert'

const PHASES: Array<{
  id: Exclude<PhaseId, 'empty' | 'alert'>
  label: string
  icon: typeof HeartPulse
}> = [
  { id: 'registered', label: 'Donante', icon: HeartPulse },
  { id: 'waiting', label: 'Lista', icon: Users },
  { id: 'assigned', label: 'Asignación', icon: Link2 },
  { id: 'in-transit', label: 'Traslado', icon: Truck },
  { id: 'received', label: 'Recepción', icon: Building2 },
]

export function casePhase(state: CaseState | null, telemetry: TelemetryReading[] = []): PhaseId {
  if (!state) return 'empty'
  if (state.receptionInfo) return 'received'
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
    'in-transit':
      telemetry.length > 0 ||
      (state?.custodyCheckpoints?.length ?? 0) > 0 ||
      !!state?.receptionInfo,
    received: !!state?.receptionInfo,
  }

  const currentIndex = PHASES.findIndex((step) => {
    if (phase === 'alert') return step.id === 'in-transit'
    return step.id === phase
  })

  return (
    <ol className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
      {PHASES.map((step, i) => {
        const Icon = step.icon
        const done = reached[step.id]
        const current = i === currentIndex
        return (
          <li
            key={step.id}
            className={`rounded-lg border px-4 py-3 ${
              phase === 'alert' && step.id === 'in-transit'
                ? 'border-red-400 bg-red-600 text-white'
                : done
                  ? 'border-teal-700 bg-teal-700 text-white'
                  : current
                    ? 'border-teal-700 bg-teal-50 text-teal-950'
                    : 'border-dashed bg-card text-slate-400'
            }`}
          >
            <Icon className="h-5 w-5" />
            <p className="text-base font-semibold mt-2">{step.label}</p>
          </li>
        )
      })}
    </ol>
  )
}
