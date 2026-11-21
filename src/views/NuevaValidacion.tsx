import { useRef, useState, type DragEvent } from 'react'
import { MOCK_OPCIONES, SLOT_DEFS } from '../data'
import { useApp } from '../context'
import { IconAlert, IconList, IconSpinner, IconTick, IconUpload, IconUploadTray, IconX } from '../icons'
import { FieldMsg } from '../components/FieldMsg'
import { Stepper } from '../components/Stepper'
import { Thumb } from '../components/Thumb'
import { ACCEPT_IMAGEN, MAX_IMAGEN_MB, MIN_LADO_PX } from '../validation'
import type { MockOpcion } from '../types'
import { ResultadoCard } from './ResultadoCard'

const dropFiles = (e: DragEvent) => Array.from(e.dataTransfer.files)

function Slots() {
  const { fotos, fotoErr, setFoto, removeFoto, primerVacio, isLoading } = useApp()
  const inputs = useRef<(HTMLInputElement | null)[]>([])
  const [over, setOver] = useState<number | null>(null)
  return (
    <div className="stack">
      <div className="hint">
        <span className="hint__long">Cada foto tiene su lugar fijo: el modelo recibe fachada → producto → etiqueta. Toca o arrastra la foto sobre su lugar.</span>
        <span className="hint__short">Cada foto en su lugar: fachada → producto → etiqueta.</span>
      </div>
      <div className="slots">
        {SLOT_DEFS.map((d, i) => {
          const foto = fotos[i]
          const isNext = i === primerVacio
          const state = fotoErr[i] ? 'error' : foto ? 'filled' : isNext ? 'next' : 'locked'
          const locked = !foto && !isNext
          const pick = () => !locked && !isLoading && inputs.current[i]?.click()
          return (
            <div key={d.label} className="slot-wrap">
              <input
                ref={(el) => { inputs.current[i] = el }}
                type="file" accept={ACCEPT_IMAGEN} hidden
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void setFoto(i, f)
                  e.target.value = ''
                }}
              />
              <button
                type="button"
                className={`slot slot--${state}${over === i ? ' is-over' : ''}${foto ? ' slot--has' : ''}`}
                aria-disabled={locked || isLoading}
                aria-describedby={`slot-msg-${i}`}
                aria-label={foto ? `${d.label}: ${foto.file.name}. Toca para cambiarla` : `${i + 1}. ${d.label}: ${d.hint}`}
                onClick={pick}
                onDragOver={(e) => { e.preventDefault(); if (!locked) setOver(i) }}
                onDragLeave={() => setOver(null)}
                onDrop={(e) => {
                  e.preventDefault(); setOver(null)
                  const f = dropFiles(e)[0]
                  if (f && !isLoading) void setFoto(i, f)
                }}
              >
                <span className="slot__num">{i + 1}</span>
                <span className="slot__label">{d.label}</span>
                <span className="slot__box">
                  {foto ? <img src={foto.url} alt="" /> : <IconUpload />}
                  {foto && !fotoErr[i] && <span className="slot__ok"><IconTick size={14} stroke="white" /></span>}
                </span>
                <span className="slot__caption" id={`slot-msg-${i}`}>
                  {fotoErr[i]
                    ? <span className="slot__err">{fotoErr[i]}</span>
                    : foto
                      ? `${foto.file.name} · ${foto.ancho}×${foto.alto} · toca para cambiar`
                      : isNext ? d.hint : `Primero sube la foto ${primerVacio + 1}`}
                </span>
              </button>
              {foto && !isLoading && (
                <button type="button" className="slot__remove" onClick={() => removeFoto(i)} aria-label={`Quitar foto de ${d.label}`}>
                  <IconX size={12} /> Quitar
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Masiva() {
  const { fotos, setAll, masivaMsg, isLoading } = useApp()
  const ref = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  return (
    <div className="stack">
      <input ref={ref} type="file" accept={ACCEPT_IMAGEN} multiple hidden
        onChange={(e) => { void setAll(Array.from(e.target.files ?? [])); e.target.value = '' }} />
      <button
        type="button"
        className={`dropzone${over ? ' is-over' : ''}`}
        disabled={isLoading}
        onClick={() => ref.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); void setAll(dropFiles(e)) }}
      >
        <span className="dropzone__icon"><IconUploadTray size={22} /></span>
        <b>
          <span className="hint__long">Arrastra aquí las 3 imágenes o toca para seleccionarlas</span>
          <span className="hint__short">Toca para elegir las 3 fotos</span>
        </b>
        <span>
          <span className="hint__long">Se asignan en el orden de selección: 1 fachada · 2 producto · 3 etiqueta.</span>
          <span className="hint__short">Orden: 1 fachada · 2 producto · 3 etiqueta</span>
        </span>
      </button>
      {masivaMsg.length > 0 && (
        <div className="notice notice--warn" role="alert">
          <b>Revisa las fotos:</b>
          <ul className="msg-list">{masivaMsg.map((m) => <li key={m}>{m}</li>)}</ul>
        </div>
      )}
      {fotos.some(Boolean) && (
        <div className="mini-row">
          {SLOT_DEFS.map((d, i) => (
            <div key={d.label} className={`mini-row__item${fotos[i] ? '' : ' is-missing'}`}>
              <Thumb src={fotos[i]?.url} alt={d.label} icon={22} />
              <span>{i + 1} · {d.label}{fotos[i] ? '' : ' (falta)'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function NuevaValidacion() {
  const s = useApp()
  const { mode, setMode, captura, setCaptura, capErr, intento, filledCount, canValidar, isLoading, validar, resetCapture } = s
  const showErr = (v: string) => intento || v.trim() !== ''
  return (
    <div className="grid12">
      <section className="card span12 card--steps">
        <Stepper paso={s.paso} errorEn={s.datosConError ? 0 : undefined} />
        <button type="button" className="link-btn" onClick={() => s.setHelpOpen(true)}>¿Cómo funciona?</button>
      </section>

      <section className="card card--gap14 span4" aria-labelledby="h-datos">
        <div className="card__head">
          <h2 id="h-datos"><span className="step-num">1</span>Datos de la captura</h2>
          <span className="opt">Opcionales</span>
        </div>
        <label className="lbl">Capture ID
          <input className="field" value={captura.captureId} placeholder={s.idSugerido} maxLength={40}
            aria-invalid={!!capErr.captureId.error && showErr(captura.captureId)} aria-describedby="m-capid"
            disabled={isLoading}
            onChange={(e) => setCaptura({ ...captura, captureId: e.target.value })} />
          <FieldMsg id="m-capid" r={capErr.captureId} show={showErr(captura.captureId)}
            ayuda={`Si lo dejas vacío se usará ${s.idSugerido}.`} />
        </label>
        <label className="lbl"><span><span className="hint__long">Código de barras capturado</span><span className="hint__short">Código de barras</span></span>
          <input className="field" value={captura.codigo} placeholder="7501234567893" inputMode="numeric" maxLength={18}
            aria-invalid={!!capErr.codigo.error && showErr(captura.codigo)} aria-describedby="m-cod"
            disabled={isLoading}
            onChange={(e) => setCaptura({ ...captura, codigo: e.target.value })} />
          <FieldMsg id="m-cod" r={capErr.codigo} show={showErr(captura.codigo)} ayuda="8, 12, 13 o 14 dígitos (EAN/UPC)." />
        </label>
        <label className="lbl">Producto esperado
          <input className="field" value={captura.producto} placeholder="Detergente Ariel 900g" maxLength={120}
            aria-invalid={!!capErr.producto.error && showErr(captura.producto)} aria-describedby="m-prod"
            disabled={isLoading}
            onChange={(e) => setCaptura({ ...captura, producto: e.target.value })} />
          <FieldMsg id="m-prod" r={capErr.producto} show={showErr(captura.producto)} ayuda="Marca, nombre y presentación." />
        </label>
      </section>

      <section className="card card--gap16 span8" aria-labelledby="h-imgs">
        <div className="card__head">
          <h2 id="h-imgs"><span className="step-num">2</span><span className="hint__long">Imágenes de la captura</span><span className="hint__short">Imágenes</span></h2>
          <div className="seg" role="group" aria-label="Forma de subir las fotos">
            <button type="button" aria-pressed={mode === 'secuencial'} className={mode === 'secuencial' ? 'is-on' : ''} onClick={() => setMode('secuencial')}>
              <IconList /> <span className="hint__long">Una por una (en orden)</span><span className="hint__short">Una por una</span>
            </button>
            <button type="button" aria-pressed={mode === 'masiva'} className={mode === 'masiva' ? 'is-on' : ''} onClick={() => setMode('masiva')}>
              <IconUploadTray /> Las 3 a la vez
            </button>
          </div>
        </div>
        <p className="req">JPG, PNG o WEBP · máximo {MAX_IMAGEN_MB} MB · mínimo {MIN_LADO_PX} px por lado.</p>

        {mode === 'secuencial' ? <Slots /> : <Masiva />}

        {s.errorServidor && (
          <div className="notice notice--bad" role="alert">
            <b><IconAlert size={14} /> {s.errorServidor.titulo}</b>
            <div className="notice__detail">Detalle del servidor: {s.errorServidor.detalle}</div>
          </div>
        )}
        {s.servidor.estado === 'caido' && (
          <div className="notice notice--warn">
            <b>El servidor de validación no responde.</b> Puedes preparar la captura; si validas sin conexión, irá a Revisión manual. Inicia el backend con <code>npm run dev:all</code>.
          </div>
        )}

        <div className="validate-bar">
          <div className="validate-bar__text">
            <b><span className="step-num step-num--sm">3</span>{filledCount} de 3 imágenes · {canValidar ? 'listo para validar' : isLoading ? 'analizando…' : `${s.pendientes.length} ${s.pendientes.length === 1 ? 'pendiente' : 'pendientes'}`}</b>
            {!canValidar && !isLoading && intento ? (
              <ul className="msg-list msg-list--bad" role="alert">{s.pendientes.map((p) => <li key={p}>{p}</li>)}</ul>
            ) : (
              <span>{isLoading ? 'Puedes cancelar si te equivocaste.' : 'Atajo: Ctrl + Enter. El análisis lo hace el modelo de visión.'}</span>
            )}
          </div>
          <div className="validate-bar__btns">
            {isLoading ? (
              <button type="button" className="btn btn--outline btn--lg" onClick={s.cancelar}>Cancelar</button>
            ) : (
              <button type="button" className="btn btn--outline btn--lg" onClick={resetCapture}>Limpiar</button>
            )}
            <button type="button" className="btn btn--blue btn--lg" aria-disabled={!canValidar} data-off={!canValidar || undefined}
              onClick={() => void validar()} title={canValidar ? 'Validar (Ctrl + Enter)' : s.pendientes.join(' · ')}>
              {isLoading ? <IconSpinner /> : <IconTick />} {isLoading ? `Analizando… ${s.segundos}s` : 'Validar con el modelo'}
            </button>
          </div>
        </div>

        {s.modoMock && !isLoading && (
          <label className="demo">
            <span>Servidor en modo simulado · forzar resultado:</span>
            <select className="field" value={s.mockOpcion} onChange={(e) => s.setMockOpcion(e.target.value as MockOpcion)}>
              {MOCK_OPCIONES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        )}
      </section>

      <ResultadoCard />
    </div>
  )
}
