import { useRef, useState } from 'react'
import { SLOT_DEFS } from '../data'
import { useApp } from '../context'
import { IconList, IconSpinner, IconTick, IconUpload, IconUploadTray } from '../icons'
import { Thumb } from '../components/Thumb'
import { ResultadoCard } from './ResultadoCard'

function Slots() {
  const { fotos, setFoto, removeFrom } = useApp()
  const inputs = useRef<(HTMLInputElement | null)[]>([])
  const nextIdx = fotos.findIndex((f) => !f)
  return (
    <div className="stack">
      <div className="hint">
        <span className="hint__long">Cada foto ocupa su lugar fijo: así el modelo recibe fachada → producto → etiqueta sin leer nombres de archivo.</span>
        <span className="hint__short">Cada foto ocupa su lugar: fachada → producto → etiqueta.</span>
      </div>
      <div className="slots">
        {SLOT_DEFS.map((d, i) => {
          const foto = fotos[i]
          const isNext = i === nextIdx
          const state = foto ? 'filled' : isNext ? 'next' : 'locked'
          return (
            <div key={d.label}>
              <input
                ref={(el) => { inputs.current[i] = el }}
                type="file" accept="image/*" hidden
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) setFoto(i, f)
                  e.target.value = ''
                }}
              />
              <button
                className={`slot slot--${state}`}
                aria-disabled={state === 'locked'}
                onClick={() => (foto ? removeFrom(i) : isNext ? inputs.current[i]?.click() : undefined)}
              >
                <span className="slot__num">{i + 1}</span>
                <span className="slot__label">{d.label}</span>
                <span className="slot__box">
                  {foto ? <img src={foto.url} alt={d.label} /> : <IconUpload />}
                  {foto && <span className="slot__ok"><IconTick size={14} stroke="white" /></span>}
                </span>
                <span className="slot__caption">
                  {foto ? `${foto.file.name} · lista (toca para quitar)` : isNext ? `Toca para subir ${d.label.toLowerCase()}` : 'Primero sube la anterior'}
                </span>
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Masiva() {
  const { fotos, setAll } = useApp()
  const ref = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  return (
    <div className="stack">
      <input ref={ref} type="file" accept="image/*" multiple hidden
        onChange={(e) => { setAll(Array.from(e.target.files ?? [])); e.target.value = '' }} />
      <button
        className={`dropzone${over ? ' is-over' : ''}`}
        onClick={() => ref.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); setAll(Array.from(e.dataTransfer.files)) }}
      >
        <span className="dropzone__icon"><IconUploadTray size={22} /></span>
        <b>
          <span className="hint__long">Arrastra aquí las 3 imágenes o toca para seleccionarlas</span>
          <span className="hint__short">Toca para elegir las 3 fotos</span>
        </b>
        <span>
          <span className="hint__long">Se asignan en el orden de selección: 1 fachada · 2 producto · 3 etiqueta. JPG o PNG.</span>
          <span className="hint__short">Orden: 1 fachada · 2 producto · 3 etiqueta</span>
        </span>
      </button>
      {fotos.some(Boolean) && (
        <div className="mini-row">
          {SLOT_DEFS.map((d, i) => (
            <div key={d.label} className="mini-row__item">
              <Thumb src={fotos[i]?.url} alt={d.label} icon={22} />
              <span>{i + 1} · {d.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function NuevaValidacion() {
  const { mode, setMode, captura, setCaptura, filledCount, allImgs, canValidar, isLoading, validar, resetCapture } = useApp()
  return (
    <div className="grid12">
      <section className="card card--gap14 span4">
        <h2>Datos de la captura</h2>
        <label className="lbl">Capture ID
          <input className="field" value={captura.captureId} placeholder="CAP-000123"
            onChange={(e) => setCaptura({ ...captura, captureId: e.target.value })} />
        </label>
        <label className="lbl"><span><span className="hint__long">Código de barras capturado</span><span className="hint__short">Código de barras</span></span>
          <input className="field" value={captura.codigo} placeholder="7501234567890"
            onChange={(e) => setCaptura({ ...captura, codigo: e.target.value })} />
        </label>
        <label className="lbl">Producto esperado
          <input className="field" value={captura.producto} placeholder="Detergente Ariel 900g"
            onChange={(e) => setCaptura({ ...captura, producto: e.target.value })} />
        </label>
      </section>

      <section className="card card--gap16 span8">
        <div className="card__head">
          <h2><span className="hint__long">Imágenes de la captura</span><span className="hint__short">Imágenes</span></h2>
          <div className="seg">
            <button className={mode === 'secuencial' ? 'is-on' : ''} onClick={() => setMode('secuencial')}>
              <IconList /> <span className="hint__long">Una por una (en orden)</span><span className="hint__short">Una por una</span>
            </button>
            <button className={mode === 'masiva' ? 'is-on' : ''} onClick={() => setMode('masiva')}>
              <IconUploadTray /> Las 3 a la vez
            </button>
          </div>
        </div>

        {mode === 'secuencial' ? <Slots /> : <Masiva />}

        <div className="validate-bar">
          <div className="validate-bar__text">
            <b>{filledCount} de 3 imágenes · {allImgs ? 'listas para validar' : `faltan ${3 - filledCount}`}</b>
            <span>El análisis lo hace el modelo de visión mediante el endpoint de validación.</span>
          </div>
          <div className="validate-bar__btns">
            <button className="btn btn--outline btn--lg" onClick={resetCapture}>Limpiar</button>
            <button className="btn btn--blue btn--lg" disabled={!canValidar} onClick={validar}>
              {isLoading ? <IconSpinner /> : <IconTick />} Validar con el modelo
            </button>
          </div>
        </div>
      </section>

      <ResultadoCard />
    </div>
  )
}

