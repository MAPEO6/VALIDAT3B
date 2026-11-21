import { useApp } from '../context'
import { chip, money, valKind, valLabel, type ChipKind } from '../format'
import { IconSpinner } from '../icons'
import { motivoDe, motivoTexto } from '../mapping'
import type { View } from '../types'

const COPY = {
  validada: ['Aprobada por el modelo', 'Las 4 validaciones salieron en ok. La captura ya está en Productos validados y en la cola de PriceCheck.', 'Ver en Productos validados', 'validados'],
  revision: ['Enviada a Revisión manual', 'El modelo no tiene la confianza suficiente para aprobar o rechazar. Un revisor debe completar los datos.', 'Abrir en Revisión manual', 'revision'],
  rechazada: ['Rechazada por el modelo', 'Hay una falla clara. La información quedó guardada en Rechazados.', 'Ver en Rechazados', 'rechazados'],
  enviada: ['Aprobada por el modelo', 'Las 4 validaciones salieron en ok. La captura ya está en Productos validados.', 'Ver en Productos validados', 'validados'],
} as const

const ROWS = [['f', 'Fachada'], ['p', 'Producto'], ['c', 'Código de barras'], ['e', 'Evidencia de precio']] as const

export function ResultadoCard() {
  const { phase, items, lastId, limpiarTodo, setNav, setSelId, segundos } = useApp()
  const last = items.find((i) => i.id === lastId)
  const showResult = (phase === 'done' || phase === 'error') && !!last

  let body
  let chipEl = null
  if (phase === 'loading') {
    body = (
      <div className="stack" aria-busy="true">
        <div className="pulse loading-line"><IconSpinner size={18} light={false} /> Analizando las 3 imágenes… ({segundos} s)</div>
        <span className="hint">{segundos < 3 ? 'Preparando y enviando las fotos.' : 'El modelo está revisando fachada, producto, código y precio.'}</span>
        <div className="pulse skeleton-grid">
          <div /><div /><div /><div />
        </div>
      </div>
    )
  } else if (showResult && last) {
    const err = phase === 'error'
    const kind: ChipKind = err ? 'bad' : last.status === 'rechazada' ? 'bad' : last.status === 'revision' ? 'warn' : 'ok'
    const copy = COPY[last.status]
    const confColor = kind === 'ok' ? '#17703C' : kind === 'warn' ? '#B7791F' : '#B3241F'
    const motivo = motivoDe(last)
    chipEl = (
      <span className="result-head">
        <span className="muted-id">{last.id}</span>
        {last.fuente === 'mock' && <span className={chip('na')} title="El backend todavía usa resultados simulados">Simulado</span>}
        <span className={chip(kind)}>
          {err ? 'Error técnico' : last.status === 'rechazada' ? 'Rechazada' : last.status === 'revision' ? 'Revisión manual' : 'Aprobada'}
        </span>
      </span>
    )
    const destino = (err ? 'revision' : copy[3]) as View
    body = (
      <div className="stack" aria-live="polite">
        <div className={`banner banner--${kind}`}>
          <b>{err ? 'No se pudo validar · enviada a Revisión manual' : copy[0]}</b>
          <span>{err ? `${last.errorMsg} Nada se aprobó automáticamente: la captura está en Revisión manual para completarla a mano.` : copy[1]}</span>
        </div>
        <div className="metrics">
          <div className="metric">
            <div className="metric__k">Confianza</div>
            <div className="metric__v">{last.confianza === null ? '—' : `${Math.round(last.confianza * 100)}%`}</div>
            <div className="bar" role="img" aria-label={`Confianza ${last.confianza === null ? 'sin dato' : Math.round(last.confianza * 100) + '%'}`}>
              <div style={{ width: `${last.confianza === null ? 0 : Math.round(last.confianza * 100)}%`, background: confColor }} />
            </div>
          </div>
          <div className="metric">
            <div className="metric__k">Precio detectado</div>
            <div className="metric__v">{money(last.precio)}</div>
            <div className="metric__s">{last.precio === null ? 'No se pudo leer' : `Tipo: ${last.tipo}`}</div>
          </div>
          <div className="metric">
            <div className="metric__k">Código de barras</div>
            <div className="metric__m">{last.codigo || '—'}</div>
          </div>
          <div className="metric">
            <div className="metric__k">Motivo</div>
            <div className="metric__t">{motivo === '—' ? 'Ninguno' : motivoTexto(motivo)}</div>
            {motivo !== '—' && <div className="metric__s mono">{motivo}</div>}
          </div>
        </div>
        <div className="chips" aria-label="Validaciones">
          {ROWS.map(([k, label]) => (
            <span key={k} className={chip(valKind[last.val[k]])}>{label}: {valLabel[last.val[k]]}</span>
          ))}
        </div>
        {last.explicacion && <p className="explain">{last.explicacion}</p>}
        <div className="actions-end">
          <button className="btn btn--outline" onClick={limpiarTodo}>Validar otra captura</button>
          <button className="btn btn--dark" onClick={() => { if (destino === 'revision') setSelId(last.id); setNav(destino) }}>
            {err ? 'Completar en Revisión manual' : copy[2]}
          </button>
        </div>
      </div>
    )
  } else {
    body = (
      <div className="empty empty--dashed">
        <b>Todavía no hay resultado</b>
        <span>Completa los pasos 1 y 2 y pulsa «Validar con el modelo». Aquí aparecerán la decisión, el precio y las validaciones.</span>
      </div>
    )
  }

  return (
    <section className="card card--gap16 span12" aria-labelledby="h-res">
      <div className="card__head">
        <h2 id="h-res"><span className="step-num">4</span>Resultado de la validación</h2>
        {chipEl}
      </div>
      {body}
    </section>
  )
}
