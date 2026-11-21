import { useApp } from '../context'
import { chip, money } from '../format'
import { Thumb } from '../components/Thumb'

export function Rechazados() {
  const { rech } = useApp()
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
          <span className={chip('bad')}>{r.motivo}</span>
        </article>
      ))}
      {rech.length === 0 && <div className="empty empty--big">No hay capturas rechazadas.</div>}
    </div>
  )
}
