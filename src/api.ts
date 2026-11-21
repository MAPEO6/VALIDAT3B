/**
 * Cliente del backend Fastify (rama main, Módulo 1).
 * Reutiliza los esquemas zod del servidor para que el contrato sea uno solo.
 */
import { REASON_CODES } from '../server/reason-codes.ts'
import {
  ErrorSchema,
  RespuestaValidarSchema,
  type CodigoError,
  type Decision,
  type MetaEntrada,
  type RespuestaValidar,
} from '../server/schemas.ts'

/** Lado mayor con el que se envían las fotos (ahorra datos y tiempo de subida). */
export const LADO_MAX_ENVIO = 1024
/** Si el servidor no contesta en este tiempo, la captura pasa a revisión manual. */
export const TIMEOUT_MS = 60_000

export interface Health {
  status: string
  modo: string
  modelo?: string
}

export type ResultadoLlamada =
  | { kind: 'ok'; data: RespuestaValidar }
  /** El servidor rechazó la entrada (4xx): el usuario puede corregirla y reintentar. */
  | { kind: 'entrada'; code: CodigoError | 'DESCONOCIDO'; message: string }
  /** No hubo respuesta útil (red, 5xx, timeout, JSON fuera de contrato). */
  | { kind: 'tecnico'; message: string }
  | { kind: 'cancelado' }

/** Mensajes para el usuario: qué pasó y cómo resolverlo. */
export const MENSAJES_ERROR: Record<CodigoError | 'DESCONOCIDO', string> = {
  IMAGENES_FALTANTES: 'Falta alguna de las 3 fotos. Revisa que estén fachada, producto y etiqueta.',
  META_INVALIDA: 'Los datos de la captura no son válidos. Revisa el Capture ID.',
  SOLICITUD_INVALIDA: 'Alguno de los archivos no es una imagen válida. Cámbialo e inténtalo de nuevo.',
  ARCHIVO_DEMASIADO_GRANDE: 'Una de las fotos es demasiado pesada. Usa una foto más ligera.',
  NO_ENCONTRADO: 'El servidor no tiene el servicio de validación. Avisa al equipo técnico.',
  ERROR_INTERNO: 'El servidor tuvo un problema interno.',
  DESCONOCIDO: 'El servidor rechazó la solicitud.',
}

export async function getHealth(signal?: AbortSignal): Promise<Health> {
  const r = await fetch('/api/health', { signal })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return (await r.json()) as Health
}

/** Lista oficial de reason_code; si el servidor no responde se usa la del código compartido. */
export async function getReasonCodes(signal?: AbortSignal): Promise<string[]> {
  try {
    const r = await fetch('/api/reason-codes', { signal })
    if (!r.ok) throw new Error()
    const body = (await r.json()) as { reason_codes?: unknown }
    if (Array.isArray(body.reason_codes) && body.reason_codes.every((x) => typeof x === 'string')) {
      return body.reason_codes as string[]
    }
  } catch {
    /* sin servidor: lista local */
  }
  return [...REASON_CODES]
}

/** Reduce la foto a LADO_MAX_ENVIO px y la convierte a JPEG. */
async function reducir(file: File, max = LADO_MAX_ENVIO): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * k)
  c.height = Math.round(bmp.height * k)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  bmp.close()
  return new Promise((ok, fail) =>
    c.toBlob((b) => (b ? ok(b) : fail(new Error('No se pudo procesar la imagen'))), 'image/jpeg', 0.85),
  )
}

export async function validarCaptura(
  meta: MetaEntrada,
  fotos: { fachada: File; producto: File; etiqueta: File },
  opts: { mock?: Decision; signal?: AbortSignal } = {},
): Promise<ResultadoLlamada> {
  const ctrl = new AbortController()
  let porTimeout = false
  const timer = setTimeout(() => {
    porTimeout = true
    ctrl.abort()
  }, TIMEOUT_MS)
  const onAbort = () => ctrl.abort()
  opts.signal?.addEventListener('abort', onAbort)

  try {
    const fd = new FormData()
    fd.append('meta', JSON.stringify(meta))
    for (const [campo, f] of Object.entries(fotos)) fd.append(campo, await reducir(f), `${campo}.jpg`)

    const url = opts.mock ? `/api/validar?mock=${opts.mock}` : '/api/validar'
    const r = await fetch(url, { method: 'POST', body: fd, signal: ctrl.signal })
    const body: unknown = await r.json().catch(() => null)

    if (r.ok) {
      const parsed = RespuestaValidarSchema.safeParse(body)
      if (parsed.success) return { kind: 'ok', data: parsed.data }
      return { kind: 'tecnico', message: 'El servidor respondió en un formato inesperado.' }
    }
    const err = ErrorSchema.safeParse(body)
    const code = err.success ? err.data.error.code : 'DESCONOCIDO'
    if (r.status >= 500 || code === 'ERROR_INTERNO' || code === 'NO_ENCONTRADO') {
      // Sin cuerpo con nuestro formato = el backend no está detrás (p. ej. 502 del proxy de Vite).
      const texto = err.success ? MENSAJES_ERROR[code] : 'No hay conexión con el servidor de validación.'
      return { kind: 'tecnico', message: `${texto} (HTTP ${r.status})` }
    }
    return { kind: 'entrada', code, message: err.success ? err.data.error.message : `HTTP ${r.status}` }
  } catch (e) {
    if (ctrl.signal.aborted && !porTimeout) return { kind: 'cancelado' }
    if (porTimeout) return { kind: 'tecnico', message: `El servidor no respondió en ${TIMEOUT_MS / 1000} s.` }
    const msg = e instanceof TypeError ? 'No hay conexión con el servidor de validación.' : (e as Error).message
    return { kind: 'tecnico', message: msg }
  } finally {
    clearTimeout(timer)
    opts.signal?.removeEventListener('abort', onAbort)
  }
}
