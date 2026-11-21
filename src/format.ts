import type { Val } from './types'

export type ChipKind = 'ok' | 'bad' | 'warn' | 'info' | 'na'

export const chip = (kind: ChipKind) => `chip chip--${kind}`

export const money = (p: number | null | undefined) =>
  p === null || p === undefined ? '—' : `$${Number(p).toFixed(2)}`

export function nowLabel() {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `Hoy, ${p(d.getHours())}:${p(d.getMinutes())}`
}

export const valLabel: Record<Val, string> = { ok: 'correcto', falla: 'falla', na: 'sin datos' }
export const valKind: Record<Val, ChipKind> = { ok: 'ok', falla: 'bad', na: 'na' }
