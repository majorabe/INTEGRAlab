'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { RoleType } from './types'

const STORAGE_KEY = 'integra-dashboard-role'

interface RoleContextValue {
  role: RoleType
  setRole: (role: RoleType) => void
}

const RoleContext = createContext<RoleContextValue | null>(null)

const VALID: RoleType[] = [
  'coordinador-nacional',
  'coordinador-provincial',
  'hospital-donante',
  'hospital-receptor',
  'iot',
]

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRoleState] = useState<RoleType>('coordinador-nacional')

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY) as RoleType | null
      if (saved && VALID.includes(saved)) setRoleState(saved)
    } catch {
      /* ignore */
    }
  }, [])

  const setRole = (next: RoleType) => {
    setRoleState(next)
    try {
      sessionStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* ignore */
    }
  }

  const value = useMemo(() => ({ role, setRole }), [role])
  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>
}

export function useRole() {
  const ctx = useContext(RoleContext)
  if (!ctx) throw new Error('useRole debe usarse dentro de RoleProvider')
  return ctx
}
