import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'INTEGRA · Infraestructura',
  description: 'Salud de los nodos, quorum y consistencia del ledger',
}

export default function InfraLayout({ children }: { children: React.ReactNode }) {
  return children
}
