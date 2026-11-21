import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SEED_BATCHES, SEED_ITEMS, buildSimulated } from './data'
import { downloadExcel as exportExcel, downloadJson as exportJson } from './export'
import { nowLabel } from './format'
import type {
  Captura, CapturaForm, CheckKey, Fase, Foto, Lote, Mode, RevForm, Simulacion, View,
} from './types'

const EMPTY_CHECKS: Record<CheckKey, boolean> = {
  fachada: false, producto: false, codigo: false, etiqueta: false, precio: false,
}

export function useAppState() {
  const [nav, setNavState] = useState<View>('nueva')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('secuencial')
  const [fotos, setFotos] = useState<(Foto | null)[]>([null, null, null])
  const [captura, setCaptura] = useState<CapturaForm>({ captureId: '', codigo: '', producto: '' })
  const [phase, setPhase] = useState<Fase>('idle')
  const [simulacion, setSimulacion] = useState<Simulacion>('exito')
  const [lastId, setLastId] = useState<string | null>(null)
  const [items, setItems] = useState<Captura[]>(SEED_ITEMS)
  const [batches, setBatches] = useState<Lote[]>(SEED_BATCHES)
  const [nextId, setNextId] = useState(134)
  const [selId, setSelId] = useState<string | null>(null)
  const [forms, setForms] = useState<Record<string, RevForm>>({})
  const [checks, setChecks] = useState<Record<string, Record<CheckKey, boolean>>>({})
  const [rechazoMotivo, setRechazoMotivo] = useState<Record<string, string>>({})
  const [pcOff, setPcOff] = useState<Record<string, boolean>>({})
  const [toast, setToast] = useState('')

  const timers = useRef<number[]>([])
  const toastKey = useRef(0)
  useEffect(() => {
    const t = timers.current
    return () => t.forEach((x) => window.clearTimeout(x))
  }, [])

  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms))
  }, [])

  const showToast = useCallback(
    (msg: string) => {
      const k = ++toastKey.current
      setToast(msg)
      later(() => {
        if (toastKey.current === k) setToast('')
      }, 2800)
    },
    [later],
  )

  const setNav = (v: View) => {
    setNavState(v)
    setDrawerOpen(false)
  }

  // ---------- derivados ----------
  const rev = useMemo(() => items.filter((i) => i.status === 'revision'), [items])
  const validados = useMemo(() => items.filter((i) => i.status === 'validada' || i.status === 'enviada'), [items])
  const queue = useMemo(() => items.filter((i) => i.status === 'validada'), [items])
  const rech = useMemo(() => items.filter((i) => i.status === 'rechazada'), [items])

  const filledCount = fotos.filter(Boolean).length
  const allImgs = filledCount === 3
  const isLoading = phase === 'loading'
  const canValidar = allImgs && !isLoading

  // ---------- imágenes ----------
  const setFoto = (i: number, file: File) => {
    setFotos((cur) => {
      if (i > 0 && !cur[i - 1]) return cur
      const next = cur.slice()
      if (next[i]) URL.revokeObjectURL(next[i]!.url)
      next[i] = { file, url: URL.createObjectURL(file) }
      return next
    })
  }
  const removeFrom = (i: number) =>
    setFotos((cur) => {
      const next = cur.slice()
      for (let j = i; j < 3; j++) {
        if (next[j]) URL.revokeObjectURL(next[j]!.url)
        next[j] = null
      }
      return next
    })
  const setAll = (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith('image/')).slice(0, 3)
    if (!imgs.length) return
    setFotos((cur) => {
      cur.forEach((f) => f && URL.revokeObjectURL(f.url))
      return [0, 1, 2].map((i) => (imgs[i] ? { file: imgs[i], url: URL.createObjectURL(imgs[i]) } : null))
    })
  }
  const resetCapture = () => {
    removeFrom(0)
    setPhase('idle')
    setLastId(null)
  }

  // ---------- validación (simulada) ----------
  /** PUNTO DE CONEXIÓN: reemplazar buildSimulated por la llamada a POST /api/validar. */
  const validar = () => {
    if (!canValidar) return
    setPhase('loading')
    const urls = fotos.map((f) => f!.url)
    const n = nextId
    const id = captura.captureId.trim() || `CAP-${String(n).padStart(6, '0')}`
    const sim = simulacion
    const datos = captura
    later(() => {
      const { item, toast: msg } = buildSimulated(sim, id, datos, urls, nowLabel())
      setItems((cur) => cur.concat(item))
      setNextId(n + 1)
      setLastId(id)
      setPhase(sim === 'error' ? 'error' : 'done')
      setFotos([null, null, null]) // las URL pasan a la captura
      showToast(msg)
    }, 1700)
  }

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
  const allChecked = CHECKS.every((k) => curChecks[k])
  const precioNum = parseFloat(form.precio)
  const canValidate = !!selItem && allChecked && form.producto.trim() !== '' && !isNaN(precioNum)
  const canReject = !!selItem && motivoR !== ''
  const hintValidar = !selItem
    ? ''
    : !allChecked
      ? 'Marca las 5 verificaciones para poder validar.'
      : isNaN(precioNum)
        ? 'Escribe el precio unitario.'
        : form.producto.trim() === ''
          ? 'Escribe el nombre del producto.'
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
    codigo: form.codigo.trim(),
    precio: isNaN(precioNum) ? null : precioNum,
    notas: form.notas,
    origen: 'Manual' as const,
    fecha: nowLabel(),
  })
  const validarManual = () => {
    if (!canValidate) return
    patchItem(sid, { ...common(), status: 'validada', tipo: form.tipo })
    setSelId(null)
    showToast(`${sid} validada · añadida a la cola de PriceCheck`)
  }
  const rechazarManual = () => {
    if (!canReject) return
    patchItem(sid, { ...common(), status: 'rechazada', motivo: motivoR })
    setSelId(null)
    showToast(`${sid} rechazada · información guardada en Rechazados`)
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
  const sendPc = () => {
    if (!pcSelIds.length) return
    const set = new Set(pcSelIds)
    setItems((cur) => cur.map((i) => (set.has(i.id) ? { ...i, status: 'enviada' } : i)))
    const n = 215 + (batches.length - SEED_BATCHES.length)
    const c = pcSelIds.length
    setBatches((cur) => [{ label: `Lote #${n} · ${c} ${c === 1 ? 'producto' : 'productos'}`, fecha: nowLabel() }, ...cur])
    showToast(`${c} ${c === 1 ? 'producto añadido' : 'productos añadidos'} al flujo de PriceCheck`)
  }

  // ---------- descargas ----------
  const downloadJson = (c: Captura) => {
    exportJson(c)
    showToast(`${c.id}.json descargado`)
  }
  const downloadExcel = () => {
    exportExcel(validados)
    showToast(`validados.xlsx descargado · ${validados.length} registros`)
  }

  return {
    nav, setNav, drawerOpen, setDrawerOpen,
    mode, setMode, fotos, setFoto, removeFrom, setAll, captura, setCaptura,
    phase, simulacion, setSimulacion, lastId, filledCount, allImgs, isLoading, canValidar,
    validar, resetCapture,
    items, batches, rev, validados, queue, rech,
    selItem, setSelId, form, setForm, curChecks, toggleCheck, motivoR, setMotivo,
    canValidate, canReject, hintValidar, validarManual, rechazarManual,
    pcSelIds, allPcOn, pcOff, togglePc, toggleAllPc, sendPc,
    downloadJson, downloadExcel, toast,
  }
}

const CHECKS: CheckKey[] = ['fachada', 'producto', 'codigo', 'etiqueta', 'precio']

export type AppState = ReturnType<typeof useAppState>
