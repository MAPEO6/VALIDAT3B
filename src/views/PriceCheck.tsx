import { useApp } from '../context'
import { chip, money } from '../format'
import { IconSend } from '../icons'

export function PriceCheck() {
  const { queue, pcOff, togglePc, toggleAllPc, allPcOn, pcSelIds, sendPc, batches, setNav } = useApp()
  return (
    <div className="grid12">
      <section className="card card--flush span8">
        <div className="list-head">
          <h2>Cola de envío</h2>
          {queue.length > 0 && (
            <label className="inline-check">
              <input type="checkbox" checked={allPcOn} onChange={toggleAllPc} />
              <span className="hint__long">Seleccionar todos</span><span className="hint__short">Todos</span>
            </label>
          )}
        </div>
        {queue.map((p) => (
          <label key={p.id} className="pc-row">
            <input type="checkbox" checked={!pcOff[p.id]} onChange={() => togglePc(p.id)} />
            <span className="pc-row__main">
              <b>{p.producto}</b>
              <small>{p.id} · <span className="hint__long">{p.codigo} · </span>{p.tipo}<span className="hint__short"> · {p.origen}</span></small>
            </span>
            <span className={`${chip(p.origen === 'IA' ? 'info' : 'warn')} hint__long`}>{p.origen}</span>
            <span className="pc-row__price">{money(p.precio)}</span>
          </label>
        ))}
        {queue.length === 0 && (
          <div className="muted-center muted-center--lg">
            No hay productos en cola. Los validados (por el modelo o manualmente) llegan aquí.
            <div><button className="btn btn--outline" onClick={() => setNav('revision')}>Ir a Revisión manual</button></div>
          </div>
        )}
      </section>

      <div className="span4 stack stack--18">
        <section className="card card--gap12">
          <div className="big-number">{pcSelIds.length}</div>
          <div className="muted-dark">de {queue.length} productos seleccionados para el flujo de PriceCheck. Se pedirá confirmación antes de enviar.</div>
          <button className="btn btn--blue btn--lg" disabled={pcSelIds.length === 0} onClick={sendPc}>
            <IconSend size={17} /> Añadir a PriceCheck
          </button>
        </section>
        <section className="card card--flush">
          <div className="list-head list-head--sm"><b>Envíos anteriores</b></div>
          {batches.map((b) => (
            <div key={b.label} className="batch">
              <span><b>{b.label}</b><small>{b.fecha}</small></span>
              <span className={chip('ok')}>Enviado</span>
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}
