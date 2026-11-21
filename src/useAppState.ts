import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { REASON_CODES } from '../server/reason-codes.ts'
import { MENSAJES_ERROR, getHealth, getReasonCodes, validarCaptura, type Health } from './api'
import { SEED_BATCHES, SEED_ITEMS, SLOT_DEFS } from './data'
import { downloadExcel as exportExcel, downloadJson as exportJson } from './export'
import { nowLabel } from './format'
import { capturaErrorTecnico, resultadoACaptura } from './mapping'
import type {
  Captura, CapturaForm, CheckKey, Fase, Foto, Lote, MockOpcion, Mode, RevForm, View,
} from './types'
import {
  mismoArchivo, parsePrecio, validarArchivo, validarCaptureId, validarCodigoBarras,
  validarDimensiones, validarPrecio, validarProducto,
} from './validation'

const EMPTY_CHECKS: Record<CheckKey, boolean> = {
  fachada: false, producto: false, codigo: false, etiqueta: false, precio: false,
}
const CHECKS: CheckKey[] = ['fachada', 'producto', 'codigo', 'etiqueta', 'precio']
const HEALTH_CADA_MS = 30_000

export type EstadoServidor =
  | { estado: 'cargando' }
  | { estado: 'ok'; info: Health }
  | { estado: 'caido' }

export interface ToastData {
  msg: string
  kind?: 'ok' | 'bad' | 'info'
  accion?: { label: string; fn: () => void }
}

export interface ConfirmData {
  titulo: string
  texto: string
  confirmar: string
  peligro?: boolean
  onOk: () => void
}

/** Abre la foto para comprobar que no esté dañada y medir su resolución. */
async function prepararFoto(file: File): Promise<{ foto?: Foto; error?: string }> {
  const err = validarArchivo(file)
  if (err) return { error: err }
  let ancho: number, alto: number
  try {
    const bmp = await createImageBitmap(file)
    ancho = bmp.width
    alto = bmp.height
    bmp.close()
  } catch {
    return { error: `No se pudo abrir «${file.name}»: el archivo parece dañado. Elige otra foto.` }
  }
  const errDim = validarDimensiones(file.name, ancho, alto)
  if (errDim) return { error: errDim }
  return { foto: { file, url: URL.createObjectURL(file), ancho, alto } }
}

export function useAppState() {
  const [nav, setNavState] = useState<View>('nueva')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [confirm, setConfirm] = useState<ConfirmData | null>(null)
  const [mode, setMode] = useState<Mode>('secuencial')
  const [fotos, setFotos] = useState<(Foto | null)[]>([null, null, null])
  const [fotoErr, setFotoErr] = useState<(string | null)[]>([null, null, null])
  const [masivaMsg, setMasivaMsg] = useState<string[]>([])
  const [captura, setCaptura] = useState<CapturaForm>({ captureId: '', codigo: '', producto: '' })
  const [intento, setIntento] = useState(false)
  const [phase, setPhase] = useState<Fase>('idle')
  const [segundos, setSegundos] = useState(0)
  const [errorServidor, setErrorServidor] = useState<{ titulo: string; detalle: string } | null>(null)
  const [mockOpcion, setMockOpcion] = useState<MockOpcion>('auto')
  const [servidor, setServidor] = useState<EstadoServidor>({ estado: 'cargando' })
  const [reasonCodes, setReasonCodes] = useState<string[]>([...REASON_CODES])
  const [lastId, setLastId] = useState<string | null>(null)
  const [items, setItems] = useState<Captura[]>(SEED_ITEMS)
  const [batches, setBatches] = useState<Lote[]>(SEED_BATCHES)
  const [nextId, setNextId] = useState(134)
  const [selId, setSelId] = useState<string | null>(null)
  const [forms, setForms] = useState<Record<string, RevForm>>({})
  const [checks, setChecks] = useState<Record<string, Record<CheckKey, boolean>>>({})
  const [rechazoMotivo, setRechazoMotivo] = useState<Record<string, string>>({})
  const [revIntento, setRevIntento] = useState<Record<string, boolean>>({})
  const [pcOff, setPcOff] = useState<Record<string, boolean>>({})
  const [toast, setToast] = useState<ToastData | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)

  // ---------- aviso inferior (con acción opcional, p. ej. Deshacer) ----------
  const showToast = useCallback((t: ToastData | string) => {
    const data = typeof t === 'string' ? { msg: t } : t
    window.clearTimeout(toastTimer.current)
    setToast(data)
    toastTimer.current = window.setTimeout(() => setToast(null), data.accion ? 7000 : 3500)
  }, [])
  const closeToast = () => {
    window.clearTimeout(toastTimer.current)
    setToast(null)
  }
  useEffect(() => () => window.clearTimeout(toastTimer.current), [])

  // ---------- estado del servidor (heurística 1) ----------
  const revisarServidor = useCallback(async () => {
    try {
      const info = await getHealth()
      setServidor({ estado: 'ok', info })
    } catch {
      setServidor({ estado: 'caido' })
    }
  }, [])
  useEffect(() => {
    const ctrl = new AbortController()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza con un sistema externo
    void revisarServidor()
    void getReasonCodes(ctrl.signal).then(setReasonCodes)
    const t = window.setInterval(() => void revisarServidor(), HEALTH_CADA_MS)
    return () => {
      ctrl.abort()
      window.clearInterval(t)
    }
  }, [revisarServidor])
  const modoMock = servidor.estado === 'ok' && (servidor.info.modo === 'mock' || servidor.info.modo === 'sin_foundry')

  // ---------- contador mientras analiza ----------
  useEffect(() => {
    if (phase !== 'loading') return
    const t = window.setInterval(() => setSegundos((s) => s + 1), 1000)
    return () => window.clearInterval(t)
  }, [phase])

  const setNav = (v: View) => {
    setNavState(v)
    setDrawerOpen(false)
  }

  // ---------- derivados ----------
  const rev = useMemo(() => items.filter((i) => i.status === 'revision'), [items])
  const validados = useMemo(() => items.filter((i) => i.status === 'validada' || i.status === 'enviada'), [items])
  const queue = useMemo(() => items.filter((i) => i.status === 'validada'), [items])
  const rech = useMemo(() => items.filter((i) => i.status === 'rechazada'), [items])
  const ids = useMemo(() => new Set(items.map((i) => i.id)), [items])

  const idSugerido = useMemo(() => {
    let n = nextId
    while (ids.has(`CAP-${String(n).padStart(6, '0')}`)) n++
    return `CAP-${String(n).padStart(6, '0')}`
  }, [ids, nextId])

  // ---------- verificaciones del formulario (antes de usar el backend) ----------
  const capErr = {
    captureId: validarCaptureId(captura.captureId, ids),
    codigo: validarCodigoBarras(captura.codigo),
    producto: validarProducto(captura.producto),
  }
  const datosConError = Object.values(capErr).some((r) => r.error)

  const filledCount = fotos.filter(Boolean).length
  const allImgs = filledCount === 3
  const isLoading = phase === 'loading'

  /** Lo que falta para poder validar, en palabras del usuario (heurísticas 5 y 9). */
  const pendientes: string[] = []
  SLOT_DEFS.forEach((d, i) => {
    if (!fotos[i]) pendientes.push(`Falta la foto ${i + 1}: ${d.label.toLowerCase()}`)
  })
  if (capErr.captureId.error) pendientes.push('Corrige el Capture ID')
  if (capErr.codigo.error) pendientes.push('Corrige el código de barras')
  if (capErr.producto.error) pendientes.push('Corrige el producto esperado')
  const canValidar = pendientes.length === 0 && !isLoading

  /** Paso actual de la guía: 0 datos · 1 fotos · 2 validar · 3 resultado. */
  const paso = phase === 'done' || phase === 'error' ? 3 : isLoading || allImgs ? 2 : filledCount > 0 ? 1 : 0

  // ---------- imágenes ----------
  const primerVacio = fotos.findIndex((f) => !f)

  const ponerFoto = (i: number, foto: Foto) =>
    setFotos((cur) => {
      const next = cur.slice()
      if (next[i]) URL.revokeObjectURL(next[i]!.url)
      next[i] = foto
      return next
    })
  const ponerError = (i: number, e: string | null) =>
    setFotoErr((cur) => cur.map((x, j) => (j === i ? e : x)))

  const setFoto = async (i: number, file: File) => {
    setErrorServidor(null)
    if (primerVacio !== -1 && i > primerVacio && !fotos[i]) {
      ponerError(i, `Primero sube la foto ${primerVacio + 1} (${SLOT_DEFS[primerVacio].label.toLowerCase()}).`)
      return
    }
    const dup = fotos.findIndex((f, j) => j !== i && f && mismoArchivo(f.file, file))
    if (dup !== -1) {
      ponerError(i, `Esa foto ya está en el lugar ${dup + 1} (${SLOT_DEFS[dup].label}). Cada lugar necesita una foto distinta.`)
      return
    }
    const { foto, error } = await prepararFoto(file)
    if (error || !foto) return ponerError(i, error ?? 'No se pudo cargar la foto.')
    ponerError(i, null)
    ponerFoto(i, foto)
  }

  /** Quita solo esa foto (las demás se conservan). */
  const removeFoto = (i: number) => {
    setFotos((cur) => {
      const next = cur.slice()
      if (next[i]) URL.revokeObjectURL(next[i]!.url)
      next[i] = null
      return next
    })
    ponerError(i, null)
  }

  /** Modo «las 3 a la vez»: el archivo i va al lugar i; los inválidos dejan su lugar vacío. */
  const setAll = async (files: File[]) => {
    setErrorServidor(null)
    const msgs: string[] = []
    if (!files.length) return
    if (files.length > 3) msgs.push(`Elegiste ${files.length} archivos; solo se usan los 3 primeros.`)
    const usados = files.slice(0, 3)
    if (usados.length < 3) msgs.push(`Faltan ${3 - usados.length} foto(s). Puedes completarlas en «Una por una».`)
    for (let i = 0; i < usados.length; i++) {
      for (let j = 0; j < i; j++) {
        if (mismoArchivo(usados[i], usados[j])) msgs.push(`La foto ${i + 1} es la misma que la ${j + 1}.`)
      }
    }
    const res = await Promise.all(usados.map(prepararFoto))
    res.forEach((r, i) => r.error && msgs.push(`Foto ${i + 1} (${SLOT_DEFS[i].label}): ${r.error}`))
    setFotos((cur) => {
      cur.forEach((f) => f && URL.revokeObjectURL(f.url))
      return [0, 1, 2].map((i) => res[i]?.foto ?? null)
    })
    setFotoErr([null, null, null])
    setMasivaMsg(msgs)
  }

  const limpiarTodo = () => {
    abortRef.current?.abort()
    setFotos((cur) => {
      cur.forEach((f) => f && URL.revokeObjectURL(f.url))
      return [null, null, null]
    })
    setFotoErr([null, null, null])
    setMasivaMsg([])
    setCaptura({ captureId: '', codigo: '', producto: '' })
    setIntento(false)
    setErrorServidor(null)
    setPhase('idle')
    setLastId(null)
  }

  /** «Limpiar» pide confirmación si hay algo que perder (heurística 3/5). */
  const resetCapture = () => {
    const hayAlgo = filledCount > 0 || captura.captureId || captura.codigo || captura.producto
    if (!hayAlgo || phase === 'done' || phase === 'error') return limpiarTodo()
    setConfirm({
      titulo: '¿Limpiar la captura?',
      texto: 'Se quitarán las fotos y los datos escritos. Esta acción no se puede deshacer.',
      confirmar: 'Sí, limpiar',
      peligro: true,
      onOk: limpiarTodo,
    })
  }

  // ---------- validación con el backend ----------
  const validar = async () => {
    setIntento(true)
    if (!canValidar) return
    const id = captura.captureId.trim() || idSugerido
    const datos = { ...captura, captureId: id }
    const fs = fotos as Foto[]
    const urls = fs.map((f) => f.url)
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setErrorServidor(null)
    setSegundos(0)
    setPhase('loading')

    const codigo = captura.codigo.replace(/\s+/g, '')
    const res = await validarCaptura(
      {
        capture_id: id,
        ...(codigo ? { codigo_barras: codigo } : {}),
        ...(captura.producto.trim() ? { producto_esperado: captura.producto.trim() } : {}),
      },
      { fachada: fs[0].file, producto: fs[1].file, etiqueta: fs[2].file },
      { mock: modoMock && mockOpcion !== 'auto' ? mockOpcion : undefined, signal: ctrl.signal },
    )
    if (abortRef.current !== ctrl) return // se limpió o se lanzó otra validación
    abortRef.current = null

    if (res.kind === 'cancelado') {
      setPhase('idle')
      showToast({ msg: 'Validación cancelada. Tus fotos y datos siguen aquí.', kind: 'info' })
      return
    }
    if (res.kind === 'entrada') {
      setPhase('idle')
      setErrorServidor({ titulo: MENSAJES_ERROR[res.code], detalle: res.message })
      return
    }

    const item =
      res.kind === 'ok'
        ? resultadoACaptura(res.data, datos, urls, nowLabel())
        : capturaErrorTecnico(id, datos, urls, nowLabel(), res.message)
    setItems((cur) => cur.concat(item))
    if (!captura.captureId.trim()) setNextId((n) => n + 1)
    setLastId(item.id)
    const esError = item.fuente === 'error'
    setPhase(esError ? 'error' : 'done')
    setFotos([null, null, null]) // las URL pasan a la captura
    setFotoErr([null, null, null])
    setMasivaMsg([])
    setCaptura({ captureId: '', codigo: '', producto: '' })
    setIntento(false)
    if (res.kind === 'tecnico') void revisarServidor()
    showToast(
      esError
        ? { msg: `No se pudo validar · ${item.id} enviada a Revisión manual`, kind: 'bad' }
        : item.status === 'validada'
          ? { msg: `${item.id} aprobada · disponible en Productos validados`, kind: 'ok' }
          : item.status === 'rechazada'
            ? { msg: `${item.id} rechazada · guardada en Rechazados`, kind: 'bad' }
            : { msg: `${item.id} enviada a Revisión manual`, kind: 'info' },
    )
  }

  const cancelar = () => abortRef.current?.abort()

  // ---------- revisión manual ----------
  const selItem = rev.find((i) => i.id === selId) ?? rev[0] ?? null
  const sid = selItem?.id ?? ''
  const defForm: RevForm = selItem
    ? {
        producto: selItem.producto,
        codigo: selItem.codigo,
        precio: selItem.precio === null ? '' : String(selItem.precio),
        tipo: selItem.tipo,
        notas: '',
      }
    : { producto: '', codigo: '', precio: '', tipo: 'regular', notas: '' }
  const form = (selItem && forms[sid]) || defForm
  const curChecks = (selItem && checks[sid]) || EMPTY_CHECKS
  const motivoR = (selItem && rechazoMotivo[sid]) || ''
  const revTried = !!revIntento[sid]
  const allChecked = CHECKS.every((k) => curChecks[k])
  const revErr = {
    producto: validarProducto(form.producto, true),
    codigo: validarCodigoBarras(form.codigo),
    precio: validarPrecio(form.precio),
  }
  const revFaltan: string[] = []
  if (!allChecked) revFaltan.push(`marca las 5 verificaciones (${CHECKS.filter((k) => curChecks[k]).length}/5)`)
  if (revErr.producto.error) revFaltan.push('revisa el producto')
  if (revErr.codigo.error) revFaltan.push('revisa el código de barras')
  if (revErr.precio.error) revFaltan.push('revisa el precio')
  const canValidate = !!selItem && revFaltan.length === 0
  const canReject = !!selItem && motivoR !== ''
  const hintValidar = !selItem
    ? ''
    : revFaltan.length
      ? `Para validar: ${revFaltan.join(', ')}.`
      : 'Listo: al validar pasa a la cola de PriceCheck.'

  const patchItem = (id: string, patch: Partial<Captura>) =>
    setItems((cur) => cur.map((i) => (i.id === id ? { ...i, ...patch } : i)))

  const setForm = (key: keyof RevForm, val: string) => {
    if (!selItem) return
    setForms((cur) => ({ ...cur, [sid]: { ...form, [key]: val } as RevForm }))
  }
  const toggleCheck = (k: CheckKey) => {
    if (!selItem) return
    setChecks((cur) => ({ ...cur, [sid]: { ...curChecks, [k]: !curChecks[k] } }))
  }
  const setMotivo = (v: string) => {
    if (selItem) setRechazoMotivo((cur) => ({ ...cur, [sid]: v }))
  }

  const common = () => ({
    producto: form.producto.trim(),
    codigo: form.codigo.replace(/\s+/g, ''),
    precio: revErr.precio.error ? null : parsePrecio(form.precio),
    notas: form.notas.trim(),
    origen: 'Manual' as const,
    confianza: null,
    fecha: nowLabel(),
  })

  /** Deshacer (heurística 3): restaura la captura tal como estaba. */
  const conDeshacer = (id: string, antes: Captura, msg: string) =>
    showToast({
      msg,
      kind: 'ok',
      accion: {
        label: 'Deshacer',
        fn: () => {
          setItems((cur) => cur.map((i) => (i.id === id ? antes : i)))
          setSelId(id)
          setNav('revision')
          showToast({ msg: `${id} volvió a Revisión manual`, kind: 'info' })
        },
      },
    })

  const validarManual = () => {
    setRevIntento((c) => ({ ...c, [sid]: true }))
    if (!canValidate || !selItem) return
    const antes = selItem
    patchItem(sid, {
      ...common(), status: 'validada', tipo: form.tipo, motivo: '—', errorMsg: '',
      val: { f: 'ok', p: 'ok', c: 'ok', e: 'ok' }, // el revisor confirmó las verificaciones
    })
    setSelId(null)
    conDeshacer(sid, antes, `${sid} validada · añadida a la cola de PriceCheck`)
  }
  const rechazarManual = () => {
    if (!canReject || !selItem) return
    const antes = selItem
    patchItem(sid, { ...common(), status: 'rechazada', motivo: motivoR })
    setSelId(null)
    conDeshacer(sid, antes, `${sid} rechazada · guardada en Rechazados`)
  }

  // ---------- PriceCheck ----------
  const qIds = queue.map((i) => i.id)
  const pcSelIds = qIds.filter((i) => !pcOff[i])
  const allPcOn = qIds.length > 0 && pcSelIds.length === qIds.length
  const togglePc = (id: string) => setPcOff((cur) => ({ ...cur, [id]: !cur[id] }))
  const toggleAllPc = () =>
    setPcOff((cur) => {
      const off = { ...cur }
      qIds.forEach((i) => (off[i] = allPcOn))
      return off
    })
  const enviarPc = (sel: string[]) => {
    const set = new Set(sel)
    setItems((cur) => cur.map((i) => (set.has(i.id) ? { ...i, status: 'enviada' } : i)))
    const n = 215 + (batches.length - SEED_BATCHES.length)
    const c = sel.length
    setBatches((cur) => [{ label: `Lote #${n} · ${c} ${c === 1 ? 'producto' : 'productos'}`, fecha: nowLabel() }, ...cur])
    showToast({ msg: `${c} ${c === 1 ? 'producto añadido' : 'productos añadidos'} al flujo de PriceCheck`, kind: 'ok' })
  }
  /** Envío a un sistema externo: se confirma antes (heurística 5). */
  const sendPc = () => {
    if (!pcSelIds.length) return
    const sel = pcSelIds.slice()
    const c = sel.length
    setConfirm({
      titulo: `¿Añadir ${c} ${c === 1 ? 'producto' : 'productos'} a PriceCheck?`,
      texto: 'Entrarán al flujo de precios como un nuevo lote. Revisa que los precios sean correctos antes de continuar.',
      confirmar: 'Sí, añadir',
      onOk: () => enviarPc(sel),
    })
  }

  // ---------- descargas ----------
  const downloadJson = (c: Captura) => {
    exportJson(c)
    showToast(`${c.id}.json descargado`)
  }
  const downloadExcel = () => {
    if (!validados.length) return showToast({ msg: 'No hay productos validados para descargar.', kind: 'info' })
    exportExcel(validados)
    showToast(`validados.xlsx descargado · ${validados.length} registros`)
  }

  return {
    nav, setNav, drawerOpen, setDrawerOpen, helpOpen, setHelpOpen, confirm, setConfirm,
    servidor, modoMock, revisarServidor, reasonCodes,
    mode, setMode, fotos, fotoErr, masivaMsg, setFoto, removeFoto, setAll, primerVacio,
    captura, setCaptura, capErr, datosConError, intento, idSugerido,
    phase, segundos, errorServidor, mockOpcion, setMockOpcion, lastId,
    filledCount, allImgs, isLoading, canValidar, pendientes, paso,
    validar, cancelar, resetCapture, limpiarTodo,
    items, batches, rev, validados, queue, rech,
    selItem, setSelId, form, setForm, revErr, revTried, curChecks, toggleCheck, motivoR, setMotivo,
    canValidate, canReject, hintValidar, validarManual, rechazarManual,
    pcSelIds, allPcOn, pcOff, togglePc, toggleAllPc, sendPc,
    downloadJson, downloadExcel, toast, closeToast,
  }
}

export type AppState = ReturnType<typeof useAppState>
