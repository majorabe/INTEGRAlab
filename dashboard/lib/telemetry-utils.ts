/**
 * Telemetry Statistics Utilities
 *
 * Shared helpers for calculating min/max/average from telemetry readings.
 * Used by TelemetryChart.tsx, CaseDetail.tsx, and other components that
 * need temperature/humidity statistics without duplicating logic.
 *
 * See DECISIONES_DE_ALCANCE.md §10 for telemetry schema details.
 */

import { TelemetryReading } from './types'

export interface TelemetryStats {
  minTemp: number
  maxTemp: number
  avgTemp: string
  avgHumidity: string
  alertCount: number
  totalReadings: number
}

/**
 * Calculate statistics from telemetry readings
 *
 * @param readings Array of TelemetryReading objects from /dashboard/casos/:id/telemetria
 * @returns Calculated statistics or null if no readings available
 *
 * Statistics:
 * - minTemp: Minimum temperature across all readings (°C)
 * - maxTemp: Maximum temperature across all readings (°C)
 * - avgTemp: Average temperature, formatted to 1 decimal place (°C)
 * - avgHumidity: Average humidity, formatted to 1 decimal place (%)
 * - alertCount: Number of readings where fueraDeRango is true
 * - totalReadings: Total number of readings processed
 */
export function calculateTelemetryStats(readings: TelemetryReading[]): TelemetryStats | null {
  if (!readings || readings.length === 0) {
    return null
  }

  const temps = readings.map((r) => r.temperaturaC)
  const humidities = readings.map((r) => r.humedadPct)
  const alerts = readings.filter((r) => r.fueraDeRango)

  return {
    minTemp: Math.min(...temps),
    maxTemp: Math.max(...temps),
    avgTemp: (temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1),
    avgHumidity: (humidities.reduce((a, b) => a + b, 0) / humidities.length).toFixed(1),
    alertCount: alerts.length,
    totalReadings: readings.length,
  }
}

/**
 * Get alert readings from telemetry data
 *
 * @param readings Array of TelemetryReading objects
 * @returns Array of readings where fueraDeRango is true, sorted by timestamp
 */
export function getAlertReadings(readings: TelemetryReading[]): TelemetryReading[] {
  if (!readings) {
    return []
  }

  return readings
    .filter((r) => r.fueraDeRango)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
}

/**
 * Format temperature value with unit
 *
 * @param temp Temperature in Celsius
 * @param decimals Number of decimal places (default: 1)
 * @returns Formatted string with °C unit
 */
export function formatTemp(temp: number, decimals: number = 1): string {
  return temp.toFixed(decimals) + '°C'
}

/**
 * Format humidity value with unit
 *
 * @param humidity Humidity percentage
 * @param decimals Number of decimal places (default: 1)
 * @returns Formatted string with % unit
 */
export function formatHumidity(humidity: number, decimals: number = 1): string {
  return humidity.toFixed(decimals) + '%'
}

/**
 * Check if reading is within safe range for kidney preservation (0-4°C)
 * See TelemetryChart.tsx line 158 for safe range context
 *
 * @param reading TelemetryReading to check
 * @returns true if temperature is within 0-4°C range for kidney
 */
export function isWithinSafeRange(reading: TelemetryReading): boolean {
  return reading.temperaturaC >= 0 && reading.temperaturaC <= 4
}
