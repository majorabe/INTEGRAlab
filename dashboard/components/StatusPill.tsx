import type { ReactNode } from 'react'

export type PillTone = 'success' | 'warning' | 'neutral' | 'danger' | 'info'

const TONES: Record<PillTone, string> = {
  success: 'bg-teal-700 text-white',
  warning: 'bg-amber-200 text-amber-950',
  neutral: 'bg-slate-200 text-slate-800',
  danger: 'bg-red-600 text-white',
  info: 'bg-sky-700 text-white',
}

export function StatusPill({
  children,
  tone = 'neutral',
  className = '',
}: {
  children: ReactNode
  tone?: PillTone
  className?: string
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold tracking-wide ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  )
}
