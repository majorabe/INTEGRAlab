'use client'

import { ClinicalBoard } from '@/components/ClinicalBoard'
import { useRole } from '@/lib/role-context'

export default function DashboardHome() {
  const { role } = useRole()

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Tablero clínico</h1>
        <p className="text-base text-muted-foreground mt-1 max-w-2xl">
          Donantes, lista de espera y órganos en traslado. La salud de los nodos está en Red.
        </p>
      </div>

      <ClinicalBoard role={role} />
    </div>
  )
}
