'use client'

import { createContext, useContext, useMemo, useState } from 'react'
import { RoleType } from './types'

interface RoleContextValue {
  role: RoleType
  setRole: (role: RoleType) => void
}

const RoleContext = createContext<RoleContextValue | null>(null)

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [role] = useState<RoleType>('coordinador-nacional')
  const value = useMemo(
    () => ({
      role,
      setRole: (_next: RoleType) => undefined,
    }),
    [role]
  )
  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>
}

export function useRole() {
  const ctx = useContext(RoleContext)
  if (!ctx) throw new Error('useRole debe usarse dentro de RoleProvider')
  return ctx
}
