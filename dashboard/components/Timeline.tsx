'use client'

import { TimelineEvent } from '@/lib/types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { History, Zap, Heart, Stethoscope, CheckCircle, AlertCircle } from 'lucide-react'

interface TimelineProps {
  events: TimelineEvent[]
  title?: string
}

/**
 * Timeline Component
 *
 * Displays chronologically ordered events from a case:
 * - donor-registry: Donor registered in system
 * - waiting-list: Patient added to waiting list
 * - assignment: Organ assignment approved
 * - custody: Telemetry/custody event recorded
 *
 * Each event shows:
 * - Timestamp and human-readable time ago
 * - Event type with icon and color coding
 * - Action description
 * - Signing actors (organizations that endorsed)
 * - Transaction hash (shortened with full hash in tooltip)
 * - Payload summary (relevant fields)
 *
 * Data comes from GET /dashboard/casos/:id/timeline endpoint (Fase 1)
 */
export function Timeline({ events = [], title = 'Línea de Tiempo de Eventos' }: TimelineProps) {
  if (!events || events.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-slate-600" />
            {title}
          </CardTitle>
          <CardDescription>Historial de eventos del caso</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-12 text-slate-500">
            <p>No hay eventos registrados para este caso</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  /**
   * Get event type details (icon, color, label)
   */
  function getEventTypeDetails(type: string) {
    const typeMap: Record<string, { icon: any; color: string; label: string; bgColor: string }> = {
      'donor-registry': {
        icon: Heart,
        color: 'text-red-600',
        label: 'Registro de Donante',
        bgColor: 'bg-red-50 border-red-200',
      },
      'waiting-list': {
        icon: Stethoscope,
        color: 'text-blue-600',
        label: 'Lista de Espera',
        bgColor: 'bg-blue-50 border-blue-200',
      },
      assignment: {
        icon: CheckCircle,
        color: 'text-green-600',
        label: 'Asignación',
        bgColor: 'bg-green-50 border-green-200',
      },
      custody: {
        icon: Zap,
        color: 'text-amber-600',
        label: 'Custodia/Telemetría',
        bgColor: 'bg-amber-50 border-amber-200',
      },
    }
    return typeMap[type] || { icon: AlertCircle, color: 'text-slate-600', label: type, bgColor: 'bg-slate-50 border-slate-200' }
  }

  /**
   * Calculate human-readable time ago string
   */
  function timeAgo(timestamp: string): string {
    const date = new Date(timestamp)
    const now = new Date()
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000)

    if (seconds < 60) return 'hace unos segundos'
    if (seconds < 3600) return `hace ${Math.floor(seconds / 60)} minuto(s)`
    if (seconds < 86400) return `hace ${Math.floor(seconds / 3600)} hora(s)`
    if (seconds < 604800) return `hace ${Math.floor(seconds / 86400)} día(s)`
    return date.toLocaleDateString()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5 text-slate-600" />
          {title}
        </CardTitle>
        <CardDescription>{events.length} evento(s) registrado(s)</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {events.map((event, idx) => {
            const typeDetails = getEventTypeDetails(event.type)
            const IconComponent = typeDetails.icon

            return (
              <div key={idx} className={`border rounded-lg p-4 ${typeDetails.bgColor} transition-colors hover:opacity-80`}>
                {/* Event Header */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1">
                    <div className={`mt-0.5 p-2 rounded-lg ${typeDetails.bgColor}`}>
                      <IconComponent className={`h-4 w-4 ${typeDetails.color}`} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-slate-900">{typeDetails.label}</p>
                        <span className="text-xs font-mono bg-white bg-opacity-60 px-2 py-1 rounded text-slate-600">
                          #{idx + 1}
                        </span>
                      </div>
                      <p className="text-sm text-slate-600 mt-1">{event.action}</p>
                    </div>
                  </div>
                </div>

                {/* Event Details Grid */}
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 ml-11">
                  {/* Timestamp */}
                  <div>
                    <p className="text-xs font-semibold text-slate-600 uppercase">Fecha y Hora</p>
                    <p className="text-sm text-slate-900 font-mono mt-1">
                      {new Date(event.timestamp).toLocaleString()}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">{timeAgo(event.timestamp)}</p>
                  </div>

                  {/* Signatures/Actors */}
                  <div>
                    <p className="text-xs font-semibold text-slate-600 uppercase">
                      Firmatarios ({event.signatureCount})
                    </p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {event.actors.map((actor, actorIdx) => (
                        <span
                          key={actorIdx}
                          className="text-xs bg-white bg-opacity-80 px-2 py-1 rounded border border-slate-300 text-slate-700 font-mono"
                        >
                          {actor}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Hash */}
                  <div className="md:col-span-1">
                    <p className="text-xs font-semibold text-slate-600 uppercase">Hash</p>
                    <div className="mt-1 group relative">
                      <p className="text-sm font-mono text-slate-900 cursor-help border-b border-dashed border-slate-400">
                        {event.hash}
                      </p>
                      <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block bg-slate-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10">
                        {event.fullHash}
                      </div>
                    </div>
                  </div>

                  {/* Payload Summary */}
                  <div className="md:col-span-1">
                    <p className="text-xs font-semibold text-slate-600 uppercase">Datos Principales</p>
                    <div className="mt-1 space-y-1 text-xs text-slate-700">
                      {Object.entries(event.payloadSummary).map(([key, value]) => (
                        <div key={key} className="flex justify-between gap-2">
                          <span className="font-semibold text-slate-600">{key}:</span>
                          <span className="text-right font-mono">
                            {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Event Type Tag */}
                <div className="mt-3 flex justify-end">
                  <span className={`text-xs font-semibold px-2 py-1 rounded ${typeDetails.color} bg-white bg-opacity-70`}>
                    {event.type}
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        {/* Timeline Legend */}
        <div className="mt-8 pt-6 border-t border-slate-200">
          <p className="text-xs font-semibold text-slate-600 uppercase mb-3">Leyenda de Tipos de Evento</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {['donor-registry', 'waiting-list', 'assignment', 'custody'].map((type) => {
              const details = getEventTypeDetails(type)
              const IconComponent = details.icon
              return (
                <div key={type} className="flex items-center gap-2">
                  <IconComponent className={`h-4 w-4 ${details.color}`} />
                  <span className="text-xs text-slate-600">{details.label}</span>
                </div>
              )
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
