import { useCallback } from 'react'
import { useApp } from '../context'
import { AYUDA } from '../data'
import { Dialog } from './Dialog'

export function ConfirmDialog() {
  const { confirm, setConfirm } = useApp()
  const close = useCallback(() => setConfirm(null), [setConfirm])
  if (!confirm) return null
  return (
    <Dialog
      titulo={confirm.titulo}
      onClose={close}
      pie={
        <>
          <button className="btn btn--outline btn--lg" data-autofocus onClick={close}>Cancelar</button>
          <button
            className={`btn btn--lg ${confirm.peligro ? 'btn--danger-solid' : 'btn--blue'}`}
            onClick={() => { confirm.onOk(); close() }}
          >
            {confirm.confirmar}
          </button>
        </>
      }
    >
      <p>{confirm.texto}</p>
    </Dialog>
  )
}

export function HelpDialog() {
  const { helpOpen, setHelpOpen } = useApp()
  const close = useCallback(() => setHelpOpen(false), [setHelpOpen])
  if (!helpOpen) return null
  return (
    <Dialog titulo="Cómo usar VALIDAT3B" onClose={close} pie={<button className="btn btn--blue btn--lg" onClick={close}>Entendido</button>}>
      <div className="help">
        {AYUDA.map((a) => (
          <section key={a.titulo}>
            <h3>{a.titulo}</h3>
            <p>{a.texto}</p>
          </section>
        ))}
        <section>
          <h3>Atajos de teclado</h3>
          <p><kbd>Ctrl</kbd> + <kbd>Enter</kbd> valida la captura · <kbd>Esc</kbd> cierra ventanas o cancela el análisis · <kbd>?</kbd> abre esta ayuda.</p>
        </section>
      </div>
    </Dialog>
  )
}
