import { CHECK_DEFS } from '../data'
import { useApp } from '../context'
import { chip } from '../format'
import { IconTick, IconX } from '../icons'
import { motivoDe, motivoTexto } from '../mapping'
import { FieldMsg } from '../components/FieldMsg'
import { Thumb } from '../components/Thumb'
import type { TipoPrecio } from '../types'

const LABELS = ['1 · Fachada', '2 · Producto', '3 · Etiqueta']

export function RevisionManual() {
  const s = useApp()
  const { rev, selItem, setSelId, form, setForm, curChecks, toggleCheck, motivoR, setMotivo, revErr, revTried, reasonCodes } = s
  const show = (v: string) => revTried || v.trim() !== ''
  const hechas = Object.values(curChecks).filter(Boolean).length
  return (
    <div className="rev-layout">
      <section className="card card--tight">
        <h2 className="h2-sm">Pendientes ({rev.length})</h2>
        {rev.map((r) => (
          <button key={r.id} className={`rev-item${selItem?.id === r.id ? ' is-sel' : ''}`} aria-current={selItem?.id === r.id || undefined} onClick={() => setSelId(r.id)}>
            <span className="rev-item__top">
              <b>{r.id}</b>
              <span className={chip(motivoDe(r) === 'ERROR_TECNICO' ? 'bad' : 'warn')}>{motivoTexto(motivoDe(r))}</span>
            </span>
            <span className="rev-item__prod">{r.producto || 'Sin datos del modelo'}</span>
            <span className="rev-item__sub">{r.confianza === null ? 'Sin lectura del modelo' : `Confianza ${Math.round(r.confianza * 100)}%`}</span>
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
            <div className="notice notice--warn"><b>{motivoTexto(motivoDe(selItem))} · confianza {selItem.confianza === null ? '—' : `${Math.round(selItem.confianza * 100)}%`}.</b> {selItem.explicacion}</div>
          )}
          <ol className="mini-steps" aria-label="Pasos de la revisión">
            <li>Mira las 3 fotos</li><li>Corrige los datos</li><li>Marca las verificaciones</li><li>Valida o rechaza</li>
          </ol>
          <div className="photos">
            {LABELS.map((l, i) => (
              <div key={l} className="photo">
                <Thumb src={selItem.fotos?.[i]} alt={l} />
                <span>{l}</span>
              </div>
            ))}
          </div>
          <div className="form-grid">
            <label className="lbl"><span>Producto <span className="req-mark" aria-hidden="true">*</span></span>
              <input className="field" value={form.producto} placeholder="Nombre y contenido" maxLength={120} required
                aria-invalid={!!revErr.producto.error && show(form.producto)} aria-describedby="r-prod"
                onChange={(e) => setForm('producto', e.target.value)} />
              <FieldMsg id="r-prod" r={revErr.producto} show={show(form.producto)} />
            </label>
            <label className="lbl">Código de barras
              <input className="field" value={form.codigo} placeholder="7501234567893" inputMode="numeric" maxLength={18}
                aria-invalid={!!revErr.codigo.error && show(form.codigo)} aria-describedby="r-cod"
                onChange={(e) => setForm('codigo', e.target.value)} />
              <FieldMsg id="r-cod" r={revErr.codigo} show={show(form.codigo)} />
            </label>
            <label className="lbl"><span>Precio unitario ($) <span className="req-mark" aria-hidden="true">*</span></span>
              <input className="field" inputMode="decimal" value={form.precio} placeholder="34.50" required
                aria-invalid={!!revErr.precio.error && show(form.precio)} aria-describedby="r-precio"
                onChange={(e) => setForm('precio', e.target.value)} />
              <FieldMsg id="r-precio" r={revErr.precio} show={show(form.precio)} ayuda="Precio de una sola pieza, sin promociones." />
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
            <div className="lbl-title">Verificaciones ({hechas}/5) <span className="req-mark" aria-hidden="true">*</span></div>
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
                  {reasonCodes.map((m) => <option key={m} value={m}>{motivoTexto(m)}</option>)}
                </select>
              </label>
              <span className="hint-text">{s.canReject ? 'Se podrá deshacer desde el aviso.' : 'Elige un motivo para poder rechazar.'}</span>
              <button className="btn btn--danger btn--lg" disabled={!s.canReject} onClick={s.rechazarManual}>
                <IconX /> Rechazar y archivar
              </button>
            </div>
            <div className="rev-actions__right">
              <span className={`hint-text${!s.canValidate && revTried ? ' hint-text--bad' : ''}`} role={revTried ? 'alert' : undefined}>{s.hintValidar}</span>
              <button className="btn btn--green btn--lg" aria-disabled={!s.canValidate} data-off={!s.canValidate || undefined} onClick={s.validarManual}>
                <IconTick size={16} /> Validar y enviar a PriceCheck
              </button>
            </div>
          </div>
        </section>
      ) : (
        <section className="empty empty--box">
          <b>Todo al día</b>
          <span>Las capturas dudosas o con error aparecerán aquí para completarlas a mano.</span>
          <button className="btn btn--outline" onClick={() => s.setNav('nueva')}>Nueva validación</button>
        </section>
      )}
    </div>
  )
}
