/**
 * Verificaciones del lado del cliente ANTES de llamar a /api/validar.
 *
 * Son funciones puras (sin DOM) para poder probarlas con `npm test`.
 * No reemplazan las validaciones del backend: solo evitan enviar solicitudes
 * que el servidor rechazaría y explican al usuario cómo corregirlas.
 */

/** Formatos que acepta el formulario (el backend acepta cualquier image/*). */
export const TIPOS_IMAGEN = ['image/jpeg', 'image/png', 'image/webp'] as const
export const ACCEPT_IMAGEN = TIPOS_IMAGEN.join(',')
/** Debe coincidir con MAX_UPLOAD_MB del backend (por defecto 25). */
export const MAX_IMAGEN_MB = 25
/** Por debajo de esto el precio de la etiqueta casi nunca es legible. */
export const MIN_LADO_PX = 320
export const MAX_CAPTURE_ID = 40
export const MAX_PRODUCTO = 120
export const MAX_PRECIO = 100_000

export interface Revision {
  /** Bloquea el envío. */
  error?: string
  /** Solo advierte; se puede continuar. */
  aviso?: string
}

export interface ArchivoInfo {
  name: string
  size: number
  type: string
  lastModified?: number
}

const mb = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1)

/** Tipo, tamaño y archivo vacío. Devuelve un mensaje de error o null. */
export function validarArchivo(f: ArchivoInfo): string | null {
  if (!(TIPOS_IMAGEN as readonly string[]).includes(f.type)) {
    const ext = f.name.includes('.') ? f.name.split('.').pop()!.toUpperCase() : 'sin extensión'
    return `«${f.name}» no es una imagen válida (${ext}). Usa una foto JPG, PNG o WEBP.`
  }
  if (f.size === 0) return `«${f.name}» está vacío. Vuelve a tomar o elegir la foto.`
  if (f.size > MAX_IMAGEN_MB * 1024 * 1024) {
    return `«${f.name}» pesa ${mb(f.size)} MB; el máximo es ${MAX_IMAGEN_MB} MB. Reduce la foto o elige otra.`
  }
  return null
}

/** Resolución mínima de la foto ya decodificada. */
export function validarDimensiones(nombre: string, ancho: number, alto: number): string | null {
  if (Math.min(ancho, alto) < MIN_LADO_PX) {
    return `«${nombre}» mide ${ancho}×${alto} px; se necesitan al menos ${MIN_LADO_PX} px por lado para leer el precio. Usa una foto más nítida.`
  }
  return null
}

/** Mismo archivo elegido dos veces (nombre, tamaño y fecha iguales). */
export function mismoArchivo(a: ArchivoInfo, b: ArchivoInfo): boolean {
  return a.name === b.name && a.size === b.size && (a.lastModified ?? 0) === (b.lastModified ?? 0)
}

const CAPTURE_ID_RE = /^[A-Za-z0-9_-]+$/
const CAPTURE_ID_SUGERIDO = /^CAP-\d{6}$/

/** capture_id: opcional (se genera uno), caracteres seguros y sin duplicados. */
export function validarCaptureId(valor: string, existentes: ReadonlySet<string>): Revision {
  const v = valor.trim()
  if (!v) return {}
  if (v.length > MAX_CAPTURE_ID) return { error: `Máximo ${MAX_CAPTURE_ID} caracteres.` }
  if (!CAPTURE_ID_RE.test(v)) return { error: 'Usa solo letras, números, guion (-) o guion bajo (_), sin espacios.' }
  if (existentes.has(v)) return { error: `Ya existe una captura con el ID ${v}. Usa otro o deja el campo vacío.` }
  if (!CAPTURE_ID_SUGERIDO.test(v)) return { aviso: 'El formato habitual es CAP-000000 (6 dígitos).' }
  return {}
}

/** Dígito verificador GS1 (EAN-8, UPC-A, EAN-13, GTIN-14). */
export function digitoVerificadorOk(codigo: string): boolean {
  const d = codigo.split('').map(Number)
  const check = d.pop()!
  let suma = 0
  // Desde la derecha (sin el verificador): pesos 3,1,3,1…
  for (let i = d.length - 1, peso = 3; i >= 0; i--, peso = peso === 3 ? 1 : 3) suma += d[i] * peso
  return (10 - (suma % 10)) % 10 === check
}

/** Código de barras: opcional; si se escribe debe ser numérico y de longitud GS1. */
export function validarCodigoBarras(valor: string, requerido = false): Revision {
  const v = valor.replace(/\s+/g, '')
  if (!v) return requerido ? { error: 'Escribe el código de barras.' } : {}
  if (!/^\d+$/.test(v)) return { error: 'El código de barras solo lleva números.' }
  if (![8, 12, 13, 14].includes(v.length)) {
    return { error: `Tiene ${v.length} dígitos; debe tener 8, 12, 13 o 14 (EAN/UPC).` }
  }
  if (!digitoVerificadorOk(v)) {
    return { aviso: 'El último dígito (verificador) no cuadra. Revisa que no falte o sobre un número.' }
  }
  return {}
}

export function validarProducto(valor: string, requerido = false): Revision {
  const v = valor.trim()
  if (!v) return requerido ? { error: 'Escribe el nombre del producto.' } : {}
  if (v.length > MAX_PRODUCTO) return { error: `Máximo ${MAX_PRODUCTO} caracteres (tiene ${v.length}).` }
  if (v.length < 3) return { error: 'Escribe al menos 3 caracteres (marca y presentación).' }
  return {}
}

/** Precio unitario de la revisión manual. */
export function validarPrecio(valor: string): Revision {
  const v = valor.trim().replace(',', '.')
  if (!v) return { error: 'Escribe el precio unitario.' }
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return { error: 'Usa un número con máximo 2 decimales, p. ej. 34.50.' }
  const n = Number(v)
  if (n <= 0) return { error: 'El precio debe ser mayor a 0.' }
  if (n > MAX_PRECIO) return { error: `El precio parece demasiado alto (máximo ${MAX_PRECIO.toLocaleString('es-MX')}).` }
  return {}
}

export const parsePrecio = (valor: string) => Number(valor.trim().replace(',', '.'))
