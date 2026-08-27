'use client'

import { RoleType } from '@/lib/types'
import { ROLE_CONFIGS, getAvailableRoles } from '@/lib/roles'
import { Button } from './ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'

interface RoleSelectorProps {
  currentRole: RoleType
  onRoleChange: (role: RoleType) => void
}

export function RoleSelector({ currentRole, onRoleChange }: RoleSelectorProps) {
  const availableRoles = getAvailableRoles()
  const currentConfig = ROLE_CONFIGS[currentRole]

  return (
    <div className="w-full bg-white border-b border-slate-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div>
              <div className="text-sm font-semibold text-slate-900">
                Rol Activo: {currentConfig.name}
              </div>
              <div className="text-xs text-slate-600">
                {currentConfig.description}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Nodo: localhost:{currentConfig.port}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-700">Cambiar rol:</label>
            <Select value={currentRole} onValueChange={(value) => onRoleChange(value as RoleType)}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableRoles.map((role) => (
                  <SelectItem key={role} value={role}>
                    {ROLE_CONFIGS[role].name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </div>
  )
}
