import { CHECK_DEFS, MOTIVOS_RECHAZO } from '../data'
import { useApp } from '../context'
import { chip } from '../format'
import { IconTick, IconX } from '../icons'
import { Thumb } from '../components/Thumb'
import type { TipoPrecio } from '../types'

const LABELS = ['1 · Fachada', '2 · Producto', '3 · Etiqueta']

export function RevisionManual() {
  const s = useApp()
  const { rev, selItem, setSelId, form, setForm, curChecks, toggleCheck, motivoR, setMotivo } = s
  return (
    <div className="rev-layout">
      <section className="card card--tight">
        <h2 className="h2-sm">Pendientes</h2>
        {rev.map((r) => (
          <button key={r.id} className={`rev-item${selItem?.id === r.id ? ' is-sel' : ''}`} onClick={() => setSelId(r.id)}>
            <span className="rev-item__top">
              <b>{r.id}</b>
              <span className={chip(r.motivo === 'ERROR_TECNICO' ? 'bad' : 'warn')}>{r.motivo}</span>
            </span>
            <span className="rev-item__prod">{r.producto || 'Sin datos del modelo'}</span>
            <span className="rev-item__sub">{r.confianza === null ? 'Sin lectura del modelo' : `Confianza ${r.confianza.toFixed(2)}`}</span>
          </button>
        ))}
        {!selItem && <div className="muted-center">No quedan capturas pendientes.</div>}
      </section>

      {selItem ? (
        <section className="card card--detail">
          <div className="card__head">
            <h2 className="h2-lg">{selItem.id}</h2>
            <span className={chip('info')}>{selItem.origen === 'IA' ? 'Detectado por IA' : 'Manual'}</span>
          </div>
          {selItem.errorMsg && (
            <div className="notice notice--bad"><b>Error en la validación automática.</b> {selItem.errorMsg} Completa los datos a mano viendo las imágenes.</div>
          )}
          {selItem.explicacion && (
            <div className="notice notice--warn"><b>{selItem.motivo} · confianza {selItem.confianza === null ? '—' : selItem.confianza.toFixed(2)}.</b> {selItem.explicacion}</div>
          )}
          <div className="photos">
            {LABELS.map((l, i) => (
              <div key={l} className="photo">
                <Thumb src={selItem.fotos?.[i]} alt={l} />
                <span>{l}</span>
              </div>
            ))}
          </div>
          <div className="form-grid">
            <label className="lbl">Producto
              <input className="field" value={form.producto} placeholder="Nombre y contenido" onChange={(e) => setForm('producto', e.target.value)} />
            </label>
            <label className="lbl">Código de barras
              <input className="field" value={form.codigo} placeholder="7501234567890" onChange={(e) => setForm('codigo', e.target.value)} />
            </label>
            <label className="lbl">Precio unitario ($)
              <input className="field" type="number" value={form.precio} placeholder="0.00" onChange={(e) => setForm('precio', e.target.value)} />
            </label>
            <label className="lbl">Tipo de precio
              <select className="field" value={form.tipo} onChange={(e) => setForm('tipo', e.target.value as TipoPrecio)}>
                <option value="regular">Regular</option>
                <option value="oferta">Oferta</option>
                <option value="volumen">Volumen</option>
              </select>
            </label>
          </div>
          <div className="stack stack--8">
            <div className="lbl-title">Verificaciones</div>
            {CHECK_DEFS.map(([k, label]) => (
              <label key={k} className={`check${curChecks[k] ? ' is-on' : ''}`}>
                <input type="checkbox" checked={curChecks[k]} onChange={() => toggleCheck(k)} />
                {label}
              </label>
            ))}
          </div>
          <label className="lbl">Notas (opcional)
            <textarea className="textarea" rows={2} value={form.notas} placeholder="Observaciones del revisor" onChange={(e) => setForm('notas', e.target.value)} />
          </label>
          <div className="rev-actions">
            <div className="rev-actions__left">
              <label className="lbl lbl--sm">Motivo del rechazo
                <select className="field" value={motivoR} onChange={(e) => setMotivo(e.target.value)}>
                  <option value="">Selecciona un motivo…</option>
                  {MOTIVOS_RECHAZO.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </label>
              <button className="btn btn--danger btn--lg" disabled={!s.canReject} onClick={s.rechazarManual}>
                <IconX /> Rechazar y archivar
              </button>
            </div>
            <div className="rev-actions__right">
              <span className="hint-text">{s.hintValidar}</span>
              <button className="btn btn--green btn--lg" disabled={!s.canValidate} onClick={s.validarManual}>
                <IconTick size={16} /> Validar y enviar a PriceCheck
              </button>
            </div>
          </div>
        </section>
      ) : (
        <section className="empty empty--box">
          <b>Todo al día</b>
          <span>Las capturas dudosas o con error aparecerán aquí para completarlas a mano.</span>
        </section>
      )}
    </div>
  )
}
