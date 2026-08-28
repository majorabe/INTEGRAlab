'use client'

import { TimelineEvent } from '@/lib/types'
import { Field, SectionCard } from './Field'

interface TimelineProps {
  events: TimelineEvent[]
}

const TYPE_LABEL: Record<string, string> = {
  'donor-registry': 'Registro de donante',
  'waiting-list': 'Lista de espera',
  assignment: 'Asignación',
  custody: 'Custodia',
}

export function Timeline({ events = [] }: TimelineProps) {
  if (!events.length) {
    return <SectionCard title="Timeline" empty="No hay eventos de ledger para este caso" />
  }

  return (
    <SectionCard title="Timeline" hint={`${events.length} evento(s) proyectados desde el ledger`}>
      <ol className="space-y-0">
        {events.map((event, idx) => (
          <li key={`${event.fullHash}-${idx}`} className="grid grid-cols-[12px_1fr] gap-4">
            <div className="flex flex-col items-center">
              <span className="mt-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
              {idx < events.length - 1 && <span className="w-px flex-1 bg-border" />}
            </div>
            <div className={`pb-6 ${idx === events.length - 1 ? 'pb-0' : ''}`}>
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {TYPE_LABEL[event.type] ?? event.type}
                </span>
                <time className="font-mono text-xs text-muted-foreground">
                  {new Date(event.timestamp).toLocaleString('es-AR')}
                </time>
              </div>
              <p className="text-sm font-medium mt-1">{event.action}</p>
              <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field
                  label={`Firmas (${event.signatureCount})`}
                  value={event.actors.join(', ')}
                  mono
                />
                <Field label="Hash" value={event.fullHash || event.hash} mono />
              </dl>
              {event.payloadSummary && Object.keys(event.payloadSummary).length > 0 && (
                <dl className="mt-3 grid grid-cols-2 gap-2">
                  {Object.entries(event.payloadSummary).map(([key, value]) => (
                    <Field
                      key={key}
                      label={key}
                      value={typeof value === 'object' ? JSON.stringify(value) : String(value)}
                      mono
                    />
                  ))}
                </dl>
              )}
            </div>
          </li>
        ))}
      </ol>
    </SectionCard>
  )
}
