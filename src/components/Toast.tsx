import { useApp } from '../context'
import { IconX } from '../icons'

export function Toast() {
  const { toast, closeToast } = useApp()
  return (
    <div role="status" aria-live="polite" className="toast-region">
      {toast && (
        <div className={`toast toast--${toast.kind ?? 'info'}`}>
          <span>{toast.msg}</span>
          {toast.accion && (
            <button className="toast__action" onClick={() => { toast.accion!.fn() }}>{toast.accion.label}</button>
          )}
          <button className="toast__close" aria-label="Cerrar aviso" onClick={closeToast}><IconX size={13} stroke="#C7CBD6" /></button>
        </div>
      )}
    </div>
  )
}
