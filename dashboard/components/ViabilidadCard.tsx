'use client'

import { useEffect, useState } from 'react'
import { CaseState, TelemetryReading } from '@/lib/types'
import { StatusPill, PillTone } from './StatusPill'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card'
import { AlertTriangle, Clock } from 'lucide-react'

interface ViabilidadCardProps {
  caseId: string
  caseState: CaseState
  telemetry: TelemetryReading[]
}

interface RespuestaViabilidad {
  horas_viables_restantes_estimadas: number
  ajuste_por_telemetria_h: number
  viable_ahora: boolean
  recomendacion: string
  nivel_alerta: 'normal' | 'precaucion' | 'critico'
}

const TONE_POR_ALERTA: Record<string, PillTone> = {
  normal: 'success',
  precaucion: 'warning',
  critico: 'danger',
}

const LABEL_POR_ALERTA: Record<string, string> = {
  normal: 'Viabilidad normal',
  precaucion: 'Precaución',
  critico: 'Crítico',
}

export function ViabilidadCard({ caseId, caseState, telemetry = [] }: ViabilidadCardProps) {
  const [resultado, setResultado] = useState<RespuestaViabilidad | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!telemetry || telemetry.length === 0) return

    const organo = caseState.donorInfo?.organType || telemetry[0]?.organo
    const extraidoEn = caseState.donorInfo?.registeredAt

    if (!organo || !extraidoEn) return

    setCargando(true)
    setError(null)

    fetch('/api/viabilidad', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        caso_id: caseId,
        organo,
        extraido_en: extraidoEn,
        lecturas: telemetry.map((t) => ({
          timestamp: t.timestamp,
          temperaturaC: t.temperaturaC,
          humedadPct: t.humedadPct,
        })),
        
      }),
    })
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Error al predecir viabilidad')
        setResultado(data)
      })
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false))
  }, [caseId, caseState, telemetry])

  if (!telemetry || telemetry.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Clock className="h-5 w-5" />
          Viabilidad estimada (ML)
        </CardTitle>
        <CardDescription>
          Predicción basada en la temperatura registrada durante el traslado.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {cargando && <p className="text-sm text-muted-foreground">Calculando...</p>}
        {error && (
          <div className="flex items-center gap-2 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </div>
        )}
        {resultado && (
          <>
            <div className="flex items-center gap-3">
              <StatusPill tone={TONE_POR_ALERTA[resultado.nivel_alerta] ?? 'neutral'}>
                {LABEL_POR_ALERTA[resultado.nivel_alerta] ?? resultado.nivel_alerta}
              </StatusPill>
              <span className="text-2xl font-bold">
                {resultado.horas_viables_restantes_estimadas.toFixed(1)} h
              </span>
              <span className="text-sm text-muted-foreground">restantes estimadas</span>
            </div>
            <p className="text-sm">{resultado.recomendacion}</p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
