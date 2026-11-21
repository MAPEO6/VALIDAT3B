import type { Revision } from '../validation'

/** Mensaje bajo un campo: error (bloquea), aviso (no bloquea) o ayuda. */
export function FieldMsg({ id, r, show, ayuda }: { id: string; r: Revision; show: boolean; ayuda?: string }) {
  if (show && r.error) return <span id={id} className="field-msg field-msg--error" role="alert">{r.error}</span>
  if (r.aviso) return <span id={id} className="field-msg field-msg--warn">{r.aviso}</span>
  if (ayuda) return <span id={id} className="field-msg">{ayuda}</span>
  return null
}
