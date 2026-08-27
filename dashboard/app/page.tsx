'use client'

import { useState, useEffect } from 'react'
import { RoleType, NodeHealth } from '@/lib/types'
import { getAPIClient } from '@/lib/api-client'
import { RoleSelector } from '@/components/RoleSelector'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AlertCircle, Activity, Lock, Zap } from 'lucide-react'

export default function Home() {
  const [currentRole, setCurrentRole] = useState<RoleType>('coordinador-nacional')
  const [nodeHealth, setNodeHealth] = useState<NodeHealth | null>(null)
  const [allNodesHealth, setAllNodesHealth] = useState<Record<RoleType, NodeHealth | null>>({
    'coordinador-nacional': null,
    'coordinador-provincial': null,
    'hospital-donante': null,
    'hospital-receptor': null,
    iot: null,
    auditor: null,
  })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Cargar salud del nodo actual cuando cambia el rol
  useEffect(() => {
    loadNodeHealth()
  }, [currentRole])

  async function loadNodeHealth() {
    setIsLoading(true)
    setError(null)
    try {
      const client = getAPIClient(currentRole)
      const health = await client.getNodeHealth()
      setNodeHealth(health)
      setAllNodesHealth((prev) => ({
        ...prev,
        [currentRole]: health,
      }))
    } catch (err: any) {
      setError(err.message || 'Error loading node health')
    } finally {
      setIsLoading(false)
    }
  }

  const handleRoleChange = (role: RoleType) => {
    setCurrentRole(role)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <RoleSelector currentRole={currentRole} onRoleChange={handleRoleChange} />

      <main className="max-w-7xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
        {/* Status Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
          <Card className="border-l-4 border-l-blue-500">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Rol Activo
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold capitalize">{currentRole}</div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-green-500">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Bloques en Ledger
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {nodeHealth?.ledgerBlocks || '—'}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Nodo sincronizado
              </p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-purple-500">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Transacciones
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {nodeHealth ? Object.values(nodeHealth.transactionsByType).reduce((a, b) => a + b, 0) : '—'}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Total en red
              </p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-orange-500">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Estado
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {nodeHealth?.status === 'ok' ? '✓ OK' : '✗ Error'}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Nodo respondiendo
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Error State */}
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
                onClick={loadNodeHealth}
                className="mt-4"
              >
                Reintentar
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
          {/* Left: Node Info */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Estado del Nodo</CardTitle>
                <CardDescription>
                  Información en tiempo real del nodo activo
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Zap className="h-8 w-8 text-slate-400 animate-spin" />
                    <span className="ml-2 text-slate-600">Cargando...</span>
                  </div>
                ) : nodeHealth ? (
                  <div className="space-y-4">
                    <div className="border-b pb-4">
                      <h4 className="font-semibold mb-2">Detalles de la Red</h4>
                      <dl className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <dt className="text-muted-foreground">Organización</dt>
                          <dd className="font-medium capitalize">{nodeHealth.org}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-muted-foreground">Bloques totales</dt>
                          <dd className="font-medium">{nodeHealth.ledgerBlocks}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-muted-foreground">Último chequeo</dt>
                          <dd className="font-medium">
                            {new Date(nodeHealth.timestamp).toLocaleTimeString()}
                          </dd>
                        </div>
                      </dl>
                    </div>

                    <div>
                      <h4 className="font-semibold mb-2">Transacciones por Tipo</h4>
                      <div className="space-y-2">
                        {Object.entries(nodeHealth.transactionsByType).map(([type, count]) => (
                          <div key={type} className="flex justify-between text-sm">
                            <dt className="text-muted-foreground capitalize">{type}</dt>
                            <dd className="font-medium">{count}</dd>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h4 className="font-semibold mb-2">Últimas 5 Transacciones</h4>
                      <div className="space-y-1 text-xs">
                        {nodeHealth.recentTransactions.slice(0, 5).map((tx, idx) => (
                          <div key={idx} className="p-2 bg-slate-50 rounded font-mono">
                            <div className="text-muted-foreground">
                              [{new Date(tx.timestamp).toLocaleTimeString()}] {tx.type}
                            </div>
                            <div className="text-slate-600 truncate">{tx.hash}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Activity className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-600">Sin información disponible</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right: Quick Start */}
          <Card>
            <CardHeader>
              <CardTitle>Inicio Rápido</CardTitle>
              <CardDescription>
                Acciones disponibles para {currentRole}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button className="w-full" variant="default">
                Ver Casos
              </Button>
              <Button className="w-full" variant="outline">
                Nuevo Caso
              </Button>
              <Button className="w-full" variant="outline">
                Buscar Compatibilidad
              </Button>

              <div className="border-t pt-4 mt-4">
                <p className="text-xs text-muted-foreground mb-3">
                  <Lock className="h-3 w-3 inline mr-1" />
                  Seguridad
                </p>
                <ul className="space-y-2 text-xs">
                  <li className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-500"></span>
                    Ledger verificado
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-500"></span>
                    Firmas validadas
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-500"></span>
                    Endorsement activo
                  </li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* All Nodes Health */}
        <Card>
          <CardHeader>
            <CardTitle>Estado de Todos los Nodos</CardTitle>
            <CardDescription>
              Vista de sincronización de la red
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {(['coordinador-nacional', 'coordinador-provincial', 'hospital-donante', 'hospital-receptor'] as RoleType[]).map((role) => (
                <div key={role} className="p-4 border rounded-lg">
                  <div className="font-semibold capitalize text-sm mb-2">{role}</div>
                  <div className="text-2xl font-bold mb-2">
                    {allNodesHealth[role]?.ledgerBlocks || '—'}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    bloques
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
