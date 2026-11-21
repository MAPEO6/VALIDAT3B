import type { Captura, CheckKey, Lote, MockOpcion, Validaciones, View } from './types'

const NA: Validaciones = { f: 'na', p: 'na', c: 'na', e: 'na' }
const OK: Validaciones = { f: 'ok', p: 'ok', c: 'ok', e: 'ok' }

const mk = (o: Partial<Captura> & Pick<Captura, 'id' | 'status'>): Captura => ({
  producto: '',
  codigo: '',
  precio: null,
  tipo: 'regular',
  confianza: null,
  origen: 'IA',
  motivo: '—',
  explicacion: '',
  errorMsg: '',
  notas: '',
  val: OK,
  fecha: 'Hoy',
  ...o,
})

/** Datos de ejemplo para que las vistas no arranquen vacías (no vienen del servidor). */
export const SEED_ITEMS: Captura[] = [
  mk({ id: 'CAP-000091', producto: 'Detergente Ariel 900g', codigo: '7501234567893', precio: 68, confianza: 0.98, status: 'enviada' }),
  mk({ id: 'CAP-000094', producto: 'Jabón Zote 400g', codigo: '7501234561234', precio: 18, confianza: 0.97, status: 'validada' }),
  mk({ id: 'CAP-000097', producto: 'Aceite 1-2-3 1L', codigo: '7501234569999', precio: 34.5, origen: 'Manual', status: 'validada' }),
  mk({ id: 'CAP-000102', producto: 'Refresco Cola 600ml', codigo: '7501234567777', precio: 16, tipo: 'oferta', confianza: 0.96, status: 'validada' }),
  mk({ id: 'CAP-000105', producto: 'Atún Dolores 140g', codigo: '7501234561111', precio: 21.9, confianza: 0.99, status: 'enviada' }),
  mk({
    id: 'CAP-000118', producto: 'Jabón Zote 400g', codigo: '7501234561234', precio: 18, confianza: 0.58, status: 'revision', fuente: 'ia',
    explicacion: 'La etiqueta está parcialmente cubierta; el precio podría no corresponder al producto.',
    val: { f: 'ok', p: 'ok', c: 'ok', e: 'falla' },
  }),
  mk({
    id: 'CAP-000121', producto: 'Aceite 1-2-3 1L', codigo: '7501234569999', precio: 34.5, confianza: 0.61, status: 'revision', fuente: 'ia',
    explicacion: 'El letrero de la fachada no se distingue con claridad.',
    val: { f: 'falla', p: 'ok', c: 'ok', e: 'ok' },
  }),
  mk({
    id: 'CAP-000126', status: 'revision', motivo: 'ERROR_TECNICO', fuente: 'error',
    errorMsg: 'No se pudo contactar al servicio de validación (timeout).', val: NA,
  }),
  mk({
    id: 'CAP-000087', producto: 'Café Legal 200g', codigo: '7501234562222', precio: 45, confianza: 0.12, status: 'rechazada',
    motivo: 'PRODUCTO_NO_COINCIDE', explicacion: 'El producto de la foto es de otra marca que la esperada.',
    val: { f: 'ok', p: 'falla', c: 'ok', e: 'ok' }, fecha: 'Hoy, 08:41',
  }),
  mk({
    id: 'CAP-000089', producto: 'Galletas Marías 170g', codigo: '7501234563333', precio: 14, origen: 'Manual', status: 'rechazada',
    motivo: 'CAPTURA_BORROSA', notas: 'La foto de la etiqueta salió movida; no se lee el precio.', val: NA, fecha: 'Hoy, 08:55',
  }),
]

export const SEED_BATCHES: Lote[] = [
  { label: 'Lote #214 · 46 productos', fecha: 'Hoy, 09:12' },
  { label: 'Lote #213 · 80 productos', fecha: 'Ayer, 18:40' },
]

export const CHECK_DEFS: [CheckKey, string][] = [
  ['fachada', 'La fachada corresponde a la cadena y tienda'],
  ['producto', 'El producto es visible, completo y coincide con el esperado'],
  ['codigo', 'El código de barras coincide con el capturado'],
  ['etiqueta', 'La etiqueta es legible y es de este producto'],
  ['precio', 'El precio es el unitario exacto'],
]

/** Campos de imagen del backend, en orden fijo. */
export const CAMPOS_IMAGEN = ['fachada', 'producto', 'etiqueta'] as const

export const SLOT_DEFS = [
  { label: 'Fachada', hint: 'Letrero y logo de la tienda completos' },
  { label: 'Producto', hint: 'Producto entero, de frente y enfocado' },
  { label: 'Etiqueta de precio', hint: 'Precio y código legibles, de cerca' },
]

export const TITLES: Record<View, [string, string]> = {
  nueva: ['Nueva validación', 'Sigue los pasos: datos, 3 fotos y validación con el modelo'],
  revision: ['Revisión manual', 'Completa los datos a mano y decide: validar o rechazar'],
  pricecheck: ['Añadir a PriceCheck', 'Productos validados listos para entrar al flujo de precios'],
  validados: ['Productos validados', 'Información extraída de las imágenes y descarga en JSON o Excel'],
  rechazados: ['Rechazados', 'Archivo con la información de las capturas rechazadas'],
}

/** Solo visible mientras el backend esté en modo simulado (GET /api/health → modo "mock", o "sin_foundry" cuando no hay llave de Foundry). */
export const MOCK_OPCIONES: { value: MockOpcion; label: string }[] = [
  { value: 'auto', label: 'Automático (según Capture ID)' },
  { value: 'aprobada', label: 'Aprobada' },
  { value: 'revision_manual', label: 'Revisión manual' },
  { value: 'rechazada', label: 'Rechazada' },
]

/** Pasos del flujo de Nueva validación (guía visible). */
export const PASOS = ['Datos', 'Fotos', 'Validar', 'Resultado'] as const

/** Contenido de la ayuda (heurística 10). */
export const AYUDA: { titulo: string; texto: string }[] = [
  { titulo: '1. Datos de la captura', texto: 'Escribe el Capture ID (si lo dejas vacío se genera uno), el código de barras y el producto esperado. Son opcionales, pero ayudan al modelo a comparar.' },
  { titulo: '2. Las 3 fotos', texto: 'Sube fachada → producto → etiqueta, en ese orden. JPG, PNG o WEBP, máximo 25 MB y al menos 320 px por lado. Puedes arrastrarlas sobre cada lugar o usar «Las 3 a la vez».' },
  { titulo: '3. Validar', texto: 'Pulsa «Validar con el modelo» (o Ctrl + Enter). Puedes cancelar mientras analiza. Si algo falta, el botón te dice qué.' },
  { titulo: '4. Resultado', texto: 'Aprobada → pasa a Productos validados y a la cola de PriceCheck. Rechazada → se archiva en Rechazados con su motivo. Revisión manual → un revisor completa los datos. Si el servidor falla, la captura va a Revisión manual: nunca se aprueba sola.' },
  { titulo: 'Revisión manual', texto: 'Mira las fotos, corrige producto, código y precio, marca las 5 verificaciones y valida; o elige un motivo y rechaza. Ambas acciones se pueden deshacer desde el aviso inferior.' },
  { titulo: 'PriceCheck y descargas', texto: 'En PriceCheck eliges qué validados enviar. En Productos validados descargas cada captura en JSON (formato de /api/validar) o todas en Excel.' },
]
