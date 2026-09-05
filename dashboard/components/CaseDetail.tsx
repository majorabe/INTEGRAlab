'use client'

import { CaseState, TelemetryReading } from '@/lib/types'
import { CaseFocus } from '@/lib/roles'
import { organLabel, preservationLabel } from '@/lib/ui-labels'
import { Field, SectionCard } from './Field'

interface CaseDetailProps {
  caseState: CaseState
  telemetry: TelemetryReading[]
  focus?: CaseFocus
}

export function CaseDetail({ caseState, telemetry = [], focus = 'full' }: CaseDetailProps) {
  const showDonor = focus === 'full' || focus === 'donor'
  const showRecipient = focus === 'full'
  const showAssignment = focus !== 'telemetry'

  return (
    <div className="space-y-4">
      {showDonor && (
        <SectionCard title="Donante" empty={!caseState.donorInfo ? 'Este caso aún no tiene donante.' : undefined}>
          {caseState.donorInfo && (
            <dl className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Field label="Identificador" value={caseState.donorInfo.donorId} />
              <Field label="Sangre" value={caseState.donorInfo.bloodType} />
              <Field label="Órgano" value={organLabel(caseState.donorInfo.organType)} />
              <Field label="HLA-A" value={caseState.donorInfo.hlaProfile.A} />
              <Field label="HLA-B" value={caseState.donorInfo.hlaProfile.B} />
              <Field label="HLA-DR" value={caseState.donorInfo.hlaProfile.DR} />
              <Field label="Preservación" value={preservationLabel(caseState.donorInfo.preservationMethod)} />
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
          empty={!caseState.recipientInfo ? 'Todavía no hay un paciente vinculado.' : undefined}
        >
          {caseState.recipientInfo && (
            <dl className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Field label="Identificador" value={caseState.recipientInfo.patientId} />
              <Field label="Sangre" value={caseState.recipientInfo.bloodType} />
              <Field label="Urgencia" value={`${caseState.recipientInfo.urgencyLevel}/5`} />
              <Field label="HLA-A" value={caseState.recipientInfo.hlaProfile.A} />
              <Field label="HLA-B" value={caseState.recipientInfo.hlaProfile.B} />
              <Field label="HLA-DR" value={caseState.recipientInfo.hlaProfile.DR} />
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
          empty={!caseState.assignmentInfo ? 'El órgano aún no fue asignado.' : undefined}
        >
          {caseState.assignmentInfo && (
            <dl className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {caseState.assignmentInfo.hlaScore !== undefined && (
                <Field label="Compatibilidad HLA" value={`${Math.round(caseState.assignmentInfo.hlaScore)} / 100`} />
              )}
              <Field
                label="Asignado"
                value={new Date(caseState.assignmentInfo.assignedAt).toLocaleString('es-AR')}
              />
            </dl>
          )}
        </SectionCard>
      )}

      {showAssignment && caseState.receptionInfo && (
        <SectionCard title="Recepción">
          <dl className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Field label="Hospital" value="Hospital receptor" />
            <Field
              label="Recibido"
              value={new Date(caseState.receptionInfo.receivedAt).toLocaleString('es-AR')}
            />
          </dl>
        </SectionCard>
      )}

      {telemetry.length > 0 && (
        <SectionCard title="Contenedor">
          <dl className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Field label="Dispositivo" value={telemetry[0].deviceId || '—'} />
            <Field
              label="Identidad PKI"
              value={telemetry[0].deviceId ? `iot:${telemetry[0].deviceId}` : '—'}
            />
            <Field label="Lecturas" value={String(telemetry.length)} />
          </dl>
        </SectionCard>
      )}
    </div>
  )
}
