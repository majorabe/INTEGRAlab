import type { ReactNode } from 'react'

export function Field({
  label,
  value,
  mono,
}: {
  label: string
  value?: ReactNode
  mono?: boolean
}) {
  const empty = value === undefined || value === null || value === ''
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd
        className={`mt-1 text-base ${mono ? 'font-mono text-sm break-all' : 'font-medium'} ${empty ? 'text-muted-foreground' : 'text-foreground'}`}
      >
        {empty ? '—' : value}
      </dd>
    </div>
  )
}

export function SectionCard({
  title,
  hint,
  children,
  empty,
}: {
  title: string
  hint?: string
  children?: ReactNode
  empty?: string
}) {
  return (
    <section className="rounded-lg border bg-card">
      <header className="border-b px-4 py-3">
        <h2 className="text-base font-semibold">{title}</h2>
        {hint && <p className="text-sm text-muted-foreground mt-0.5">{hint}</p>}
      </header>
      <div className="p-4">{empty ? <p className="text-sm text-muted-foreground">{empty}</p> : children}</div>
    </section>
  )
}
