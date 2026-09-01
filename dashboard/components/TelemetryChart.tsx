'use client'

import { TelemetryReading } from '@/lib/types'
import { calculateTelemetryStats, getAlertReadings, formatTemp, formatHumidity } from '@/lib/telemetry-utils'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { AlertTriangle, Droplet, Thermometer } from 'lucide-react'

interface TelemetryChartProps {
  data: TelemetryReading[]
  title?: string
  description?: string
}

/**
 * Telemetry visualization component
 * Displays temperature and humidity data from IoT sensors during organ transport
 *
 * Data schema from iot-simulator (real):
 * - temperaturaC: temperature in Celsius
 * - humedadPct: humidity percentage
 * - fueraDeRango: alert flag (true if out of safe range)
 * - gps: GPS coordinates (not visualized in chart, could add map later)
 */
export function TelemetryChart({
  data,
  title = 'Telemetría de Custodia',
  description = 'Temperatura y humedad durante transporte del órgano',
}: TelemetryChartProps) {
  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Thermometer className="h-5 w-5" />
            {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-12 text-slate-500">
            <p>
              Todavía no hay lecturas custody con organId de este caso. Es normal hasta el assignment y el
              arranque del IoT. El gráfico no inventa puntos.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Prepare data for charts (add index for readability)
  const chartData = data.map((reading, index) => ({
    ...reading,
    index: index + 1,
    timestamp: new Date(reading.timestamp).toLocaleTimeString(),
  }))

  // Calculate statistics using shared helper
  const stats = calculateTelemetryStats(data)
  const alerts = getAlertReadings(data)

  if (!stats) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Thermometer className="h-5 w-5" />
            {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-12 text-slate-500">
            <p>
              Todavía no hay lecturas custody con organId de este caso. Es normal hasta el assignment y el
              arranque del IoT. El gráfico no inventa puntos.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const { minTemp, maxTemp, avgTemp, avgHumidity } = stats

  return (
    <div className="space-y-6">
      {/* Alerts */}
      {alerts.length > 0 && (
        <Card className="bg-red-50 border-red-200">
          <CardHeader className="flex flex-row items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <CardTitle className="text-red-900">Lecturas Fuera de Rango</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              {alerts.map((alert, idx) => (
                <div key={idx} className="p-2 bg-white rounded border border-red-200">
                  <div className="font-semibold text-red-800">
                    Lectura #{chartData.find((d) => d.temperaturaC === alert.temperaturaC)?.index || idx + 1} - {new Date(alert.timestamp).toLocaleTimeString()}
                  </div>
                  <div className="text-red-700">
                    Temperatura: {formatTemp(alert.temperaturaC)} (fuera de rango seguro: 0-4°C)
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Temp. Mínima
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatTemp(minTemp)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Temp. Máxima
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatTemp(maxTemp)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Temp. Promedio
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatTemp(parseFloat(avgTemp))}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Humedad Prom.
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatHumidity(parseFloat(avgHumidity))}</div>
          </CardContent>
        </Card>
      </div>

      {/* Temperature Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Thermometer className="h-5 w-5" />
            Temperatura Durante Transporte
          </CardTitle>
          <CardDescription>
            Rango seguro para riñón: 0-4°C (mostrado con zona sombreada)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorTemp" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorAlert" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="index"
                stroke="#64748b"
                style={{ fontSize: '0.875rem' }}
              />
              <YAxis
                stroke="#64748b"
                style={{ fontSize: '0.875rem' }}
                domain={[Math.min(-1, minTemp - 1), Math.max(6, maxTemp + 1)]}
                label={{ value: '°C', angle: -90, position: 'insideLeft' }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #64748b',
                  borderRadius: '0.5rem',
                  color: '#f1f5f9',
                }}
                formatter={(value) => {
                  if (typeof value === 'number') {
                    return [value.toFixed(2) + '°C', 'Temperatura']
                  }
                  return value
                }}
                labelFormatter={(label) => `Lectura #${label}`}
              />
              <Area
                type="monotone"
                dataKey="temperaturaC"
                stroke="#3b82f6"
                fillOpacity={1}
                fill="url(#colorTemp)"
                name="Temperatura"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Humidity Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Droplet className="h-5 w-5" />
            Humedad Durante Transporte
          </CardTitle>
          <CardDescription>
            Porcentaje de humedad relativa en el contenedor
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="index"
                stroke="#64748b"
                style={{ fontSize: '0.875rem' }}
              />
              <YAxis
                stroke="#64748b"
                style={{ fontSize: '0.875rem' }}
                domain={[0, 100]}
                label={{ value: '%', angle: -90, position: 'insideLeft' }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #64748b',
                  borderRadius: '0.5rem',
                  color: '#f1f5f9',
                }}
                formatter={(value) => {
                  if (typeof value === 'number') {
                    return [value.toFixed(1) + '%', 'Humedad']
                  }
                  return value
                }}
                labelFormatter={(label) => `Lectura #${label}`}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="humedadPct"
                stroke="#10b981"
                strokeWidth={2}
                name="Humedad"
                isAnimationActive={false}
                dot={{ fill: '#10b981', r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Data Table */}
      <Card>
        <CardHeader>
          <CardTitle>Lecturas Detalladas ({chartData.length} registros)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 px-3 font-semibold text-slate-600">#</th>
                  <th className="text-left py-2 px-3 font-semibold text-slate-600">
                    Timestamp
                  </th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-600">
                    Temp (°C)
                  </th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-600">
                    Humedad (%)
                  </th>
                  <th className="text-center py-2 px-3 font-semibold text-slate-600">
                    Alerta
                  </th>
                </tr>
              </thead>
              <tbody>
                {chartData.slice(-10).map((row, idx) => (
                  <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-2 px-3 text-slate-600">{row.index}</td>
                    <td className="py-2 px-3 text-slate-600 font-mono text-xs">
                      {row.timestamp}
                    </td>
                    <td
                      className={`py-2 px-3 text-right font-semibold ${
                        row.fueraDeRango ? 'text-red-600' : 'text-green-600'
                      }`}
                    >
                      {formatTemp(row.temperaturaC, 2)}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-600">
                      {formatHumidity(row.humedadPct)}
                    </td>
                    <td className="py-2 px-3 text-center">
                      {row.fueraDeRango ? (
                        <span className="inline-block px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-semibold">
                          Sí
                        </span>
                      ) : (
                        <span className="inline-block px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-semibold">
                          No
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {chartData.length > 10 && (
            <p className="text-xs text-slate-500 mt-4">
              Mostrando últimas 10 de {chartData.length} lecturas
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
