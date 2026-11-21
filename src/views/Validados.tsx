import { useApp } from '../context'
import { chip, money } from '../format'
import { IconDownload } from '../icons'
import { Thumb } from '../components/Thumb'

export function Validados() {
  const { validados, downloadExcel, downloadJson, setNav } = useApp()
  return (
    <div className="stack stack--16">
      <div className="toolbar">
        <span className="toolbar__text"><b>{validados.length}</b> productos validados. Cada tarjeta se descarga como JSON; el Excel junta todos.</span>
        <button className="btn btn--green" disabled={validados.length === 0} onClick={downloadExcel}>
          <IconDownload size={16} /> Descargar todo en Excel<span className="hint__short"> ({validados.length})</span>
        </button>
      </div>
      <div className="cards">
        {validados.map((c) => (
          <article key={c.id} className="vcard">
            <div className="vcard__top">
              <small>{c.id}</small>
              <span className={chip(c.origen === 'IA' ? 'info' : 'warn')}>{c.origen}</span>
            </div>
            <div className="thumbs">
              {[0, 1, 2].map((i) => <Thumb key={i} src={c.fotos?.[i]} alt={`Foto ${i + 1}`} icon={16} />)}
            </div>
            <div className="vcard__name">{c.producto}</div>
            <div className="mini-grid">
              <div className="mini"><small>Precio · {c.tipo}</small><b>{money(c.precio)}</b></div>
              <div className="mini"><small>Confianza</small><b>{c.confianza === null ? 'Manual' : `${Math.round(c.confianza * 100)}%`}</b></div>
            </div>
            <div className="vcard__code">Código: <b>{c.codigo}</b></div>
            <div className="vcard__foot">
              <span className={chip(c.status === 'enviada' ? 'ok' : 'na')}>{c.status === 'enviada' ? 'Enviado a PriceCheck' : 'En cola de PriceCheck'}</span>
              <button className="btn btn--json" aria-label={`Descargar ${c.id} en JSON`} onClick={() => downloadJson(c)}><IconDownload size={14} stroke="currentColor" /> JSON</button>
            </div>
          </article>
        ))}
      </div>
      {validados.length === 0 && (
        <div className="empty empty--big">
          <b>Aún no hay productos validados</b>
          <span>Aparecen aquí cuando el modelo aprueba una captura o un revisor la valida.</span>
          <button className="btn btn--outline" onClick={() => setNav('nueva')}>Nueva validación</button>
        </div>
      )}
    </div>
  )
}
