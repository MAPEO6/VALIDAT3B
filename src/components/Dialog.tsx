import { useEffect, useRef, type ReactNode } from 'react'
import { IconX } from '../icons'

/** Diálogo modal accesible: Esc o clic fuera lo cierran y el foco vuelve a donde estaba. */
export function Dialog({ titulo, onClose, children, pie }: { titulo: string; onClose: () => void; children: ReactNode; pie?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    const first = ref.current?.querySelector<HTMLElement>('[data-autofocus]') ?? ref.current?.querySelector<HTMLElement>('button')
    first?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      prev?.focus()
    }
  }, [onClose])
  return (
    <div className="modal" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="modal__box" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal__head">
          <h2 id="modal-title">{titulo}</h2>
          <button className="modal__close" aria-label="Cerrar" onClick={onClose}><IconX size={15} /></button>
        </div>
        <div className="modal__body">{children}</div>
        {pie && <div className="modal__foot">{pie}</div>}
      </div>
    </div>
  )
}
