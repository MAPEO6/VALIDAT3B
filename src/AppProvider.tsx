import type { ReactNode } from 'react'
import { AppContext } from './context'
import { useAppState } from './useAppState'

export function AppProvider({ children }: { children: ReactNode }) {
  const state = useAppState()
  return <AppContext.Provider value={state}>{children}</AppContext.Provider>
}
