import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'INTEGRAlab Dashboard',
  description: 'Dashboard para coordinación de trasplantes con blockchain',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es">
      <body className="bg-slate-50">
        {children}
      </body>
    </html>
  )
}
