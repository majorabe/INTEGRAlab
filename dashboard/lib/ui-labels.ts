const ORGAN_LABEL: Record<string, string> = {
  kidney: 'Riñón',
  rinon: 'Riñón',
  liver: 'Hígado',
  higado: 'Hígado',
  heart: 'Corazón',
  lung: 'Pulmón',
  pulmon: 'Pulmón',
}

export function organLabel(value?: string | null): string {
  if (!value) return '—'
  return ORGAN_LABEL[value.toLowerCase()] ?? value
}

export function preservationLabel(value?: string | null): string {
  if (!value) return '—'
  return value.replace(/-/g, ' ')
}
