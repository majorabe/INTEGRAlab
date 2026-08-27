'use client'

import { CaseState, TelemetryReading } from '@/lib/types'
import { calculateTelemetryStats, formatTemp, formatHumidity } from '@/lib/telemetry-utils'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { AlertTriangle, Heart, Stethoscope, Thermometer, Droplet, Clock, CheckCircle } from 'lucide-react'

interface CaseDetailProps {
  caseState: CaseState
  telemetry: TelemetryReading[]
  title?: string
}

/**
 * CaseDetail Component
 *
 * Displays consolidated case information:
 * - Donor registry information (blood type, HLA profile, organ type, preservation method)
 * - Recipient information (blood type, HLA profile, urgency level)
 * - Assignment details (organ assignment, HLA score, timestamps)
 * - Custody summary (temperature/humidity statistics from telemetry)
 *
 * Used by case view page (/dashboard/casos/:id) and case list detail panel.
 */
export function CaseDetail({
  caseState,
  telemetry = [],
  title = 'Detalles del Caso',
}: CaseDetailProps) {
  const telemetryStats = calculateTelemetryStats(telemetry)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-slate-900">{title}</h2>
        <p className="text-sm text-slate-500 mt-1">
          Último actualizado: {caseState.lastUpdated ? new Date(caseState.lastUpdated).toLocaleString() : 'N/A'}
        </p>
      </div>

      {/* Donor Information */}
      {caseState.donorInfo ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Heart className="h-5 w-5 text-red-600" />
              Información del Donante
            </CardTitle>
            <CardDescription>Datos registrados del donante</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm font-semibold text-slate-600">ID Donante</p>
                <p className="text-lg font-mono text-slate-900">{caseState.donorInfo.donorId}</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-600">Tipo de Sangre</p>
                <p className="text-lg font-bold text-slate-900">{caseState.donorInfo.bloodType}</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-600">Tipo de Órgano</p>
                <p className="text-lg capitalize text-slate-900">{caseState.donorInfo.organType}</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-600">HLA-A</p>
                <p className="text-lg font-mono text-slate-900">{caseState.donorInfo.hlaProfile.A}</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-600">HLA-B</p>
                <p className="text-lg font-mono text-slate-900">{caseState.donorInfo.hlaProfile.B}</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-600">HLA-DR</p>
                <p className="text-lg font-mono text-slate-900">{caseState.donorInfo.hlaProfile.DR}</p>
              </div>
              <div className="col-span-2 md:col-span-1">
                <p className="text-sm font-semibold text-slate-600">Método de Preservación</p>
                <p className="text-lg capitalize text-slate-900">{caseState.donorInfo.preservationMethod.replace('-', ' ')}</p>
              </div>
              <div className="col-span-2 md:col-span-1">
                <p className="text-sm font-semibold text-slate-600">Fecha de Registro</p>
                <p className="text-sm text-slate-900">{new Date(caseState.donorInfo.registeredAt).toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-slate-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-600">
              <Heart className="h-5 w-5" />
              Información del Donante
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-slate-500">Sin información de donante registrada</p>
          </CardContent>
        </Card>
      )}

      {/* Recipient Information */}
      {caseState.recipientInfo ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Stethoscope className="h-5 w-5 text-blue-600" />
              Información del Receptor
            </CardTitle>
            <CardDescription>Datos del paciente en lista de espera</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm font-semibold text-slate-600">ID Paciente</p>
                <p className="text-lg font-mono text-slate-900">{caseState.recipientInfo.patientId}</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-600">Tipo de Sangre</p>
                <p className="text-lg font-bold text-slate-900">{caseState.recipientInfo.bloodType}</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-600">Nivel de Urgencia</p>
                <p className="text-lg font-bold text-orange-600">{caseState.recipientInfo.urgencyLevel}/5</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-600">HLA-A</p>
                <p className="text-lg font-mono text-slate-900">{caseState.recipientInfo.hlaProfile.A}</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-600">HLA-B</p>
                <p className="text-lg font-mono text-slate-900">{caseState.recipientInfo.hlaProfile.B}</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-600">HLA-DR</p>
                <p className="text-lg font-mono text-slate-900">{caseState.recipientInfo.hlaProfile.DR}</p>
              </div>
              <div className="col-span-2 md:col-span-1">
                <p className="text-sm font-semibold text-slate-600">Fecha de Registro en Lista</p>
                <p className="text-sm text-slate-900">{new Date(caseState.recipientInfo.addedToWaitingListAt).toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-slate-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-600">
              <Stethoscope className="h-5 w-5" />
              Información del Receptor
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-slate-500">Sin información de receptor registrada</p>
          </CardContent>
        </Card>
      )}

      {/* Assignment Information */}
      {caseState.assignmentInfo ? (
        <Card className="border-green-200 bg-green-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-900">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Asignación de Órgano
            </CardTitle>
            <CardDescription className="text-green-700">Donante → Receptor</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm font-semibold text-green-800">Donante</p>
                <p className="text-lg font-mono text-green-900">{caseState.assignmentInfo.donorId}</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-green-800">Receptor</p>
                <p className="text-lg font-mono text-green-900">{caseState.assignmentInfo.recipientId}</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-green-800">Órgano</p>
                <p className="text-lg capitalize font-semibold text-green-900">{caseState.assignmentInfo.organ}</p>
              </div>
              {caseState.assignmentInfo.hlaScore !== undefined && (
                <div>
                  <p className="text-sm font-semibold text-green-800">Score HLA</p>
                  <p className="text-lg font-bold text-green-900">{caseState.assignmentInfo.hlaScore.toFixed(2)}</p>
                </div>
              )}
              <div>
                <p className="text-sm font-semibold text-green-800">Fecha de Asignación</p>
                <p className="text-sm text-green-900">{new Date(caseState.assignmentInfo.assignedAt).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-green-800">Compatibilidad Calculada</p>
                <p className="text-sm text-green-900">{new Date(caseState.assignmentInfo.compatibilityTimestamp).toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-slate-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-600">
              <CheckCircle className="h-5 w-5" />
              Asignación de Órgano
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-slate-500">Sin asignación registrada</p>
          </CardContent>
        </Card>
      )}

      {/* Custody Summary (from telemetry statistics) */}
      {telemetryStats ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Thermometer className="h-5 w-5 text-blue-600" />
              Resumen de Custodia
            </CardTitle>
            <CardDescription>Estadísticas de temperatura y humedad durante transporte</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* Temperature Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <p className="text-xs font-semibold text-slate-600 uppercase">Temp. Mínima</p>
                  <p className="text-xl font-bold text-slate-900 mt-1">{formatTemp(telemetryStats.minTemp)}</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <p className="text-xs font-semibold text-slate-600 uppercase">Temp. Máxima</p>
                  <p className="text-xl font-bold text-slate-900 mt-1">{formatTemp(telemetryStats.maxTemp)}</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <p className="text-xs font-semibold text-slate-600 uppercase">Temp. Promedio</p>
                  <p className="text-xl font-bold text-slate-900 mt-1">{formatTemp(parseFloat(telemetryStats.avgTemp))}</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <p className="text-xs font-semibold text-slate-600 uppercase">Humedad Prom.</p>
                  <p className="text-xl font-bold text-slate-900 mt-1">{formatHumidity(parseFloat(telemetryStats.avgHumidity))}</p>
                </div>
              </div>

              {/* Summary Stats */}
              <div className="border-t pt-4">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-600">Total Lecturas</p>
                    <p className="text-lg font-bold text-slate-900">{telemetryStats.totalReadings}</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-600">Lecturas Fuera de Rango</p>
                    <p className={`text-lg font-bold ${telemetryStats.alertCount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {telemetryStats.alertCount}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-600">Estado de Rango Seguro</p>
                    <p className={`text-sm font-semibold ${telemetryStats.alertCount === 0 ? 'text-green-700 bg-green-50' : 'text-red-700 bg-red-50'} px-3 py-1 rounded w-fit`}>
                      {telemetryStats.alertCount === 0 ? '✓ Dentro de rango' : '⚠ Fuera de rango detectado'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Alert Banner */}
              {telemetryStats.alertCount > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-red-900">Lectura(s) fuera de rango detectada(s)</p>
                    <p className="text-sm text-red-700 mt-1">
                      Se registraron {telemetryStats.alertCount} lectura(s) con temperatura fuera del rango seguro para riñón (0-4°C).
                      Se recomienda revisar el registro detallado de telemetría.
                    </p>
                  </div>
                </div>
              )}

              {/* Safe Range Info */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-900">
                  <strong>Rango seguro para riñón:</strong> 0-4°C según protocolos internacionales de preservación de órganos.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-slate-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-600">
              <Thermometer className="h-5 w-5" />
              Resumen de Custodia
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-slate-500">Sin datos de telemetría disponibles</p>
          </CardContent>
        </Card>
      )}

      {/* Transaction Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-slate-600" />
            Resumen de Transacciones
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-600">Total Transacciones</p>
              <p className="text-2xl font-bold text-slate-900">{caseState.transactionCount}</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-600">Último Evento</p>
              <p className="text-sm text-slate-900">
                {caseState.lastUpdated ? new Date(caseState.lastUpdated).toLocaleDateString() : 'N/A'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
