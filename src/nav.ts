import type { ComponentType } from 'react'
import { IconCheck, IconClock, IconPlus, IconSend, IconXCircle } from './icons'
import type { View } from './types'

export const NAV: { id: View; label: string; short: string; Icon: ComponentType<{ size?: number }> }[] = [
  { id: 'nueva', label: 'Nueva validación', short: 'Nueva', Icon: IconPlus },
  { id: 'revision', label: 'Revisión manual', short: 'Revisión', Icon: IconClock },
  { id: 'pricecheck', label: 'Añadir a PriceCheck', short: 'PriceCheck', Icon: IconSend },
  { id: 'validados', label: 'Productos validados', short: 'Validados', Icon: IconCheck },
  { id: 'rechazados', label: 'Rechazados', short: 'Rechazados', Icon: IconXCircle },
]
