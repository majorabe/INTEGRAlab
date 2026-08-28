'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { RoleType } from '@/lib/types'
import { getAPIClient } from '@/lib/api-client'
import { CaseDetail } from '@/components/CaseDetail'
import { Timeline } from '@/components/Timeline'
import { TelemetryChart } from '@/components/TelemetryChart'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AlertCircle, Loader2, ArrowLeft } from 'lucide-react'

export default function CaseDetailPage() {
  const router = useRouter()
  const params = useParams()
  const caseId = params.id as string
  const [currentRole] = useState<RoleType>('coordinador-nacional')

  const [caseData, setCaseData] = useState<any>(null)
  const [timeline, setTimeline] = useState<any[]>([])
  const [telemetry, setTelemetry] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadCaseData()
  }, [caseId])

  async function loadCaseData() {
    setIsLoading(true)
    setError(null)
    try {
      const client = getAPIClient(currentRole)

      // Intentar cargar desde dashboard endpoint
      try {
        const data = await client.getCaseState(caseId)
        if (data?.found) {
          setCaseData(data)
        }
      } catch (err) {
        // Fallback: cargar desde ledger
        console.log('Dashboard endpoint no disponible, usando ledger directo')
        const ledger = await client.getLedger()
        if (ledger?.blocks) {
          const caseBlocks = ledger.blocks.filter((b: any) => b.payload?.donorId === caseId)
          if (caseBlocks.length > 0) {
            setCaseData({
              found: true,
              donorId: caseId,
              donorInfo: caseBlocks[0].payload,
              blocks: caseBlocks,
            })
          }
        }
      }

      // Cargar timeline
      try {
        const tlData = await client.getCaseTimeline(caseId)
        if (tlData?.timeline) {
          setTimeline(tlData.timeline)
        }
      } catch (err) {
        console.log('Timeline no disponible')
      }

      // Cargar telemetría
      try {
        const telData = await client.getCaseTelemetry(caseId)
        if (telData?.telemetry) {
          setTelemetry(telData.telemetry)
        }
      } catch (err) {
        console.log('Telemetría no disponible')
      }
    } catch (err: any) {
      setError(err.message || 'Error cargando caso')
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-12 w-12 text-slate-400 animate-spin" />
          <p className="text-slate-600">Cargando caso...</p>
        </div>
      </div>
    )
  }

  if (error || !caseData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="max-w-7xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.back()}
            className="mb-8 flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Button>

          <Card className="bg-red-50 border-red-200">
            <CardHeader className="flex flex-row items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-600" />
              <CardTitle className="text-red-900">Error</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-red-800">
                {error || 'No se encontró el caso'}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-7xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.back()}
          className="mb-8 flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver
        </Button>

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900">
            Caso: {caseId}
          </h1>
          <p className="text-slate-600 mt-2">
            Información completa del donante, receptor y custodia
          </p>
        </div>

        {/* Case Details */}
        <div className="mb-12">
          <CaseDetail
            donorId={caseId}
            donorData={caseData?.donorInfo}
            recipientData={caseData?.recipientInfo}
            assignmentData={caseData?.assignmentInfo}
            custodyData={caseData?.custodyCheckpoints}
          />
        </div>

        {/* Telemetry Chart */}
        {telemetry && telemetry.length > 0 && (
          <div className="mb-12">
            <TelemetryChart
              data={telemetry}
              title="Cadena de Custodia - Telemetría"
              description="Temperatura y humedad durante el transporte del órgano"
            />
          </div>
        )}

        {/* Timeline */}
        {timeline && timeline.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Línea de Tiempo</CardTitle>
              <CardDescription>
                Eventos cronológicos del caso
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Timeline events={timeline} />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
