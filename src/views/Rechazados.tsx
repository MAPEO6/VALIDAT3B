import { useApp } from '../context'
import { chip, money } from '../format'
import { Thumb } from '../components/Thumb'
import { motivoTexto } from '../mapping'

export function Rechazados() {
  const { rech, setNav } = useApp()
  return (
    <div className="stack stack--12">
      {rech.map((r) => (
        <article key={r.id} className="rrow">
          <div className="thumbs thumbs--sm">
            {[0, 1, 2].map((i) => <Thumb key={i} src={r.fotos?.[i]} alt={`Foto ${i + 1}`} icon={14} />)}
          </div>
          <div className="rrow__main">
            <b>{r.producto || 'Sin nombre'}</b>
            <small>{r.id} · {r.codigo || '—'} · {money(r.precio)} · {r.fecha}</small>
            <span>{r.notas || r.explicacion || 'Sin notas'}</span>
          </div>
          <span className={chip(r.origen === 'IA' ? 'info' : 'warn')}>{r.origen}</span>
          <span className={chip('bad')} title={r.motivo}>{motivoTexto(r.motivo)}</span>
        </article>
      ))}
      {rech.length === 0 && (
        <div className="empty empty--big">
          <b>No hay capturas rechazadas</b>
          <span>Las capturas que el modelo o un revisor rechacen se guardan aquí con su motivo.</span>
          <button className="btn btn--outline" onClick={() => setNav('nueva')}>Nueva validación</button>
        </div>
      )}
    </div>
  )
}
