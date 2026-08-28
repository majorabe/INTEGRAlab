'use client'

import { CaseState, TelemetryReading } from '@/lib/types'
import { CaseFocus } from '@/lib/roles'
import { calculateTelemetryStats, formatHumidity, formatTemp } from '@/lib/telemetry-utils'
import { Field, SectionCard } from './Field'

interface CaseDetailProps {
  caseState: CaseState
  telemetry: TelemetryReading[]
  focus?: CaseFocus
}

export function CaseDetail({ caseState, telemetry = [], focus = 'full' }: CaseDetailProps) {
  const stats = calculateTelemetryStats(telemetry)
  const showDonor = focus === 'full' || focus === 'donor'
  const showRecipient = focus === 'full'
  const showAssignment = focus !== 'telemetry'
  const showCustody = focus === 'full' || focus === 'custody' || focus === 'telemetry'
  const showTx = focus === 'full' || focus === 'donor'

  return (
    <div className="space-y-4">
      {showDonor && (
        <SectionCard
          title="Donante"
          hint="Proyección de transacciones donor-registry"
          empty={!caseState.donorInfo ? 'Sin registro de donante en este caso' : undefined}
        >
          {caseState.donorInfo && (
            <dl className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Field label="ID" value={caseState.donorInfo.donorId} mono />
              <Field label="Sangre" value={caseState.donorInfo.bloodType} />
              <Field label="Órgano" value={caseState.donorInfo.organType} />
              <Field label="HLA-A" value={caseState.donorInfo.hlaProfile.A} mono />
              <Field label="HLA-B" value={caseState.donorInfo.hlaProfile.B} mono />
              <Field label="HLA-DR" value={caseState.donorInfo.hlaProfile.DR} mono />
              <Field
                label="Preservación"
                value={caseState.donorInfo.preservationMethod.replace(/-/g, ' ')}
              />
              <Field
                label="Registrado"
                value={new Date(caseState.donorInfo.registeredAt).toLocaleString('es-AR')}
              />
            </dl>
          )}
        </SectionCard>
      )}

      {showRecipient && (
        <SectionCard
          title="Receptor"
          hint="Proyección de waiting-list"
          empty={!caseState.recipientInfo ? 'Sin paciente de lista de espera vinculado' : undefined}
        >
          {caseState.recipientInfo && (
            <dl className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Field label="ID" value={caseState.recipientInfo.patientId} mono />
              <Field label="Sangre" value={caseState.recipientInfo.bloodType} />
              <Field label="Urgencia" value={`${caseState.recipientInfo.urgencyLevel}/5`} />
              <Field label="HLA-A" value={caseState.recipientInfo.hlaProfile.A} mono />
              <Field label="HLA-B" value={caseState.recipientInfo.hlaProfile.B} mono />
              <Field label="HLA-DR" value={caseState.recipientInfo.hlaProfile.DR} mono />
              <Field
                label="En lista desde"
                value={new Date(caseState.recipientInfo.addedToWaitingListAt).toLocaleString('es-AR')}
              />
            </dl>
          )}
        </SectionCard>
      )}

      {showAssignment && (
        <SectionCard
          title="Asignación"
          hint="Proyección de assignment (endorsement ya validado en el nodo)"
          empty={!caseState.assignmentInfo ? 'Sin asignación en el ledger para este caso' : undefined}
        >
          {caseState.assignmentInfo && (
            <dl className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Field label="Donante" value={caseState.assignmentInfo.donorId} mono />
              <Field label="Receptor" value={caseState.assignmentInfo.recipientId} mono />
              <Field label="Órgano" value={caseState.assignmentInfo.organ} />
              {caseState.assignmentInfo.hlaScore !== undefined && (
                <Field label="Score HLA" value={caseState.assignmentInfo.hlaScore.toFixed(2)} />
              )}
              <Field
                label="Asignado"
                value={new Date(caseState.assignmentInfo.assignedAt).toLocaleString('es-AR')}
              />
            </dl>
          )}
        </SectionCard>
      )}

      {showCustody && (
        <SectionCard
          title="Custodia"
          hint="Estadísticas derivadas de lecturas custody ya grabadas"
          empty={!stats ? 'Sin telemetría en el ledger para este caso' : undefined}
        >
          {stats && (
            <div className="space-y-4">
              <dl className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-md border bg-muted/60 p-3">
                  <Field label="Temp. mín" value={formatTemp(stats.minTemp)} />
                </div>
                <div className="rounded-md border bg-muted/60 p-3">
                  <Field label="Temp. máx" value={formatTemp(stats.maxTemp)} />
                </div>
                <div className="rounded-md border bg-muted/60 p-3">
                  <Field label="Temp. prom" value={formatTemp(parseFloat(stats.avgTemp))} />
                </div>
                <div className="rounded-md border bg-muted/60 p-3">
                  <Field label="Humedad prom" value={formatHumidity(parseFloat(stats.avgHumidity))} />
                </div>
              </dl>
              <dl className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <Field label="Lecturas" value={String(stats.totalReadings)} />
                <Field label="Fuera de rango" value={String(stats.alertCount)} />
                <Field
                  label="Cadena de frío"
                  value={stats.alertCount === 0 ? 'Dentro de rango' : 'Hay lecturas fuera de rango'}
                />
              </dl>
              {stats.alertCount > 0 && (
                <p className="text-sm text-destructive">
                  {stats.alertCount} lectura(s) con temperatura fuera de 0–4 °C (riñón). Dato del ledger, no estimado.
                </p>
              )}
            </div>
          )}
        </SectionCard>
      )}

      {showTx && (
        <SectionCard title="Actividad en ledger" hint="Conteo de bloques que afectan este caso">
          <dl className="grid grid-cols-2 gap-4">
            <Field label="Transacciones" value={String(caseState.transactionCount)} />
            <Field
              label="Último evento"
              value={
                caseState.lastUpdated ? new Date(caseState.lastUpdated).toLocaleString('es-AR') : undefined
              }
            />
          </dl>
        </SectionCard>
      )}
    </div>
  )
}
