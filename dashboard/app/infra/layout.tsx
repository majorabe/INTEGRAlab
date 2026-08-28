import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'INTEGRA /infra',
  description: 'Panel de infraestructura: estado crudo de los nodos y suite de tests',
}

export default function InfraLayout({ children }: { children: React.ReactNode }) {
  return children
}
