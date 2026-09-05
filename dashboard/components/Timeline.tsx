'use client'

import { Building2, HeartPulse, Link2, Thermometer, Users } from 'lucide-react'
import { TimelineEvent } from '@/lib/types'
import { SectionCard } from './Field'

interface TimelineProps {
  events: TimelineEvent[]
}

const TYPE_META: Record<
  string,
  { label: string; icon: typeof HeartPulse }
> = {
  'donor-registry': { label: 'Donante', icon: HeartPulse },
  'waiting-list': { label: 'Lista de espera', icon: Users },
  assignment: { label: 'Asignación', icon: Link2 },
  custody: { label: 'Custodia', icon: Thermometer },
  reception: { label: 'Recepción', icon: Building2 },
}

export function Timeline({ events = [] }: TimelineProps) {
  if (!events.length) {
    return <SectionCard title="Historial" empty="Todavía no hay eventos en este caso." />
  }

  const visible = collapseCustody(events)

  return (
    <SectionCard title="Historial">
      <ol className="space-y-0">
        {visible.map((item, idx) => {
          const meta = TYPE_META[item.type] ?? { label: item.type, icon: HeartPulse }
          const Icon = meta.icon
          return (
            <li key={`${item.fullHash}-${idx}`} className="grid grid-cols-[2rem_1fr] gap-3">
              <div className="flex flex-col items-center">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-700 text-white">
                  <Icon className="h-4 w-4" />
                </span>
                {idx < visible.length - 1 && <span className="w-px flex-1 bg-border" />}
              </div>
              <div className={idx === visible.length - 1 ? 'pb-0' : 'pb-6'}>
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-base font-semibold">{meta.label}</span>
                  <time className="text-sm text-muted-foreground">
                    {new Date(item.timestamp).toLocaleString('es-AR')}
                  </time>
                </div>
                <p className="text-base mt-1 text-muted-foreground">{item.summary}</p>
              </div>
            </li>
          )
        })}
      </ol>
    </SectionCard>
  )
}

function collapseCustody(events: TimelineEvent[]): Array<TimelineEvent & { summary: string }> {
  const out: Array<TimelineEvent & { summary: string }> = []
  let custodyCount = 0
  let lastCustody: TimelineEvent | null = null

  const flushCustody = () => {
    if (!lastCustody || custodyCount === 0) return
    out.push({
      ...lastCustody,
      summary:
        custodyCount === 1
          ? lastCustody.action
          : `${custodyCount} lecturas de temperatura durante el traslado`,
    })
    custodyCount = 0
    lastCustody = null
  }

  for (const event of events) {
    if (event.type === 'custody') {
      custodyCount += 1
      lastCustody = event
      continue
    }
    flushCustody()
    out.push({ ...event, summary: event.action })
  }
  flushCustody()
  return out
}
