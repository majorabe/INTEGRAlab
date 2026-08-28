'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { RoleType } from '@/lib/types'
import { getAPIClient } from '@/lib/api-client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AlertCircle, Loader2 } from 'lucide-react'

interface Case {
  id: string
  donorId: string
  patientId?: string
  status: string
  bloodType?: string
  organ?: string
  lastUpdate?: string
}

export default function CasosPage() {
  const [currentRole] = useState<RoleType>('coordinador-nacional')
  const [cases, setCases] = useState<Case[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadCases()
  }, [])

  async function loadCases() {
    setIsLoading(true)
    setError(null)
    try {
      const client = getAPIClient(currentRole)
      const ledger = await client.getLedger()

      // Procesar bloques para extraer casos únicos
      const casesMap = new Map<string, Case>()

      if (ledger?.blocks) {
        ledger.blocks.forEach((block: any) => {
          const donorId = block.payload?.donorId
          if (donorId) {
            if (!casesMap.has(donorId)) {
              casesMap.set(donorId, {
                id: donorId,
                donorId,
                status: block.txType,
                bloodType: block.payload?.bloodType,
                organ: block.payload?.organo || block.payload?.organ,
                lastUpdate: block.timestamp,
              })
            }
          }
        })
      }

      setCases(Array.from(casesMap.values()))
    } catch (err: any) {
      setError(err.message || 'Error cargando casos')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-7xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900">Casos de Trasplante</h1>
          <p className="text-slate-600 mt-2">Gestión centralizada de donantes y receptores</p>
        </div>

        {error && (
          <Card className="bg-red-50 border-red-200 mb-8">
            <CardHeader className="flex flex-row items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-600" />
              <CardTitle className="text-red-900">Error</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-red-800">{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={loadCases}
                className="mt-4"
              >
                Reintentar
              </Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Listado de Casos</CardTitle>
            <CardDescription>
              Total: {cases.length} casos registrados en el ledger
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 text-slate-400 animate-spin" />
                <span className="ml-2 text-slate-600">Cargando casos...</span>
              </div>
            ) : cases.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-slate-600">No hay casos registrados aún</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-200">
                    <tr>
                      <th className="text-left py-3 px-4 font-semibold text-slate-700">ID Donante</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-700">Tipo de Sangre</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-700">Órgano</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-700">Estado</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-700">Última Actualización</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-700">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {cases.map((caseItem) => (
                      <tr key={caseItem.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-mono text-xs text-slate-600">
                          {caseItem.donorId}
                        </td>
                        <td className="py-3 px-4">
                          {caseItem.bloodType ? (
                            <span className="inline-block bg-blue-100 text-blue-800 px-2 py-1 rounded">
                              {caseItem.bloodType}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {caseItem.organ ? (
                            <span className="capitalize">{caseItem.organ}</span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-block bg-slate-100 text-slate-800 px-2 py-1 rounded text-xs capitalize">
                            {caseItem.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-500">
                          {caseItem.lastUpdate
                            ? new Date(caseItem.lastUpdate).toLocaleString()
                            : '—'}
                        </td>
                        <td className="py-3 px-4">
                          <Link href={`/casos/${caseItem.id}`}>
                            <Button variant="outline" size="sm">
                              Ver Detalle
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
