import { useApp } from '../context'

export function Summary() {
  const { validados, rech, rev } = useApp()
  return (
    <div className="summary">
      <div className="summary__item"><b style={{ color: '#5EE08F' }}>{validados.length}</b><span>Validadas</span></div>
      <div className="summary__item"><b style={{ color: '#FF7A7F' }}>{rech.length}</b><span>Rechazadas</span></div>
      <div className="summary__item"><b style={{ color: '#F7C15E' }}>{rev.length}</b><span>Revisión</span></div>
    </div>
  )
}
