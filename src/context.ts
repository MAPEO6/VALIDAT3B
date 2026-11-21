import { createContext, useContext } from 'react'
import type { AppState } from './useAppState'

export const AppContext = createContext<AppState | null>(null)

export function useApp(): AppState {
  const v = useContext(AppContext)
  if (!v) throw new Error('useApp fuera de AppProvider')
  return v
}
