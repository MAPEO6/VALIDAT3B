import type { Captura, CapturaForm, CheckKey, Lote, Simulacion, Validaciones, View } from './types'

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

export const SEED_ITEMS: Captura[] = [
  mk({ id: 'CAP-000091', producto: 'Detergente Ariel 900g', codigo: '7501234567890', precio: 68, confianza: 0.98, status: 'enviada' }),
  mk({ id: 'CAP-000094', producto: 'Jabón Zote 400g', codigo: '7501234561234', precio: 18, confianza: 0.97, status: 'validada' }),
  mk({ id: 'CAP-000097', producto: 'Aceite 1-2-3 1L', codigo: '7501234569999', precio: 34.5, origen: 'Manual', status: 'validada' }),
  mk({ id: 'CAP-000102', producto: 'Refresco Cola 600ml', codigo: '7501234567777', precio: 16, tipo: 'oferta', confianza: 0.96, status: 'validada' }),
  mk({ id: 'CAP-000105', producto: 'Atún Dolores 140g', codigo: '7501234561111', precio: 21.9, confianza: 0.99, status: 'enviada' }),
  mk({
    id: 'CAP-000118', producto: 'Jabón Zote 400g', codigo: '7501234561234', precio: 18, confianza: 0.58, status: 'revision',
    motivo: 'EVIDENCIA_DUDOSA',
    explicacion: 'La etiqueta está parcialmente cubierta; el precio podría no corresponder al producto.',
    val: { f: 'ok', p: 'ok', c: 'dudoso', e: 'dudoso' },
  }),
  mk({
    id: 'CAP-000121', producto: 'Aceite 1-2-3 1L', codigo: '7501234569999', precio: 34.5, confianza: 0.61, status: 'revision',
    motivo: 'FACHADA_DUDOSA', explicacion: 'El letrero de la fachada no se distingue con claridad.',
    val: { f: 'dudoso', p: 'ok', c: 'ok', e: 'ok' },
  }),
  mk({
    id: 'CAP-000126', status: 'revision', motivo: 'ERROR_TECNICO',
    errorMsg: 'No se pudo contactar al servicio de validación (timeout).', val: NA,
  }),
  mk({
    id: 'CAP-000087', producto: 'Café Legal 200g', codigo: '7501234562222', precio: 45, confianza: 0.12, status: 'rechazada',
    motivo: 'PRODUCTO_NO_COINCIDE', explicacion: 'El producto de la foto es de otra marca que la esperada.',
    val: { f: 'ok', p: 'falla', c: 'ok', e: 'ok' }, fecha: 'Hoy, 08:41',
  }),
  mk({
    id: 'CAP-000089', producto: 'Galletas Marías 170g', codigo: '7501234563333', precio: 14, origen: 'Manual', status: 'rechazada',
    motivo: 'FOTO_DE_PANTALLA', notas: 'Foto tomada a la pantalla de otro celular.', val: NA, fecha: 'Hoy, 08:55',
  }),
]

export const SEED_BATCHES: Lote[] = [
  { label: 'Lote #214 · 46 productos', fecha: 'Hoy, 09:12' },
  { label: 'Lote #213 · 80 productos', fecha: 'Ayer, 18:40' },
]

/** Provisional: reemplazar por la lista oficial de reason_code. */
export const MOTIVOS_RECHAZO = [
  'PRODUCTO_NO_COINCIDE',
  'FACHADA_INCORRECTA',
  'FOTO_BORROSA',
  'FOTO_DE_PANTALLA',
  'CODIGO_NO_COINCIDE',
  'PRECIO_ILEGIBLE',
] as const

export const CHECK_DEFS: [CheckKey, string][] = [
  ['fachada', 'La fachada corresponde a la cadena y tienda'],
  ['producto', 'El producto es visible, completo y coincide con el esperado'],
  ['codigo', 'El código de barras coincide con el capturado'],
  ['etiqueta', 'La etiqueta es legible y es de este producto'],
  ['precio', 'El precio es el unitario exacto'],
]

export const SLOT_DEFS = [
  { label: 'Fachada', hint: 'Letrero y logo de la tienda' },
  { label: 'Producto', hint: 'Producto completo y visible' },
  { label: 'Etiqueta de precio', hint: 'Precio y código legibles' },
]

export const TITLES: Record<View, [string, string]> = {
  nueva: ['Nueva validación', 'Sube las 3 fotos y valida la captura con el modelo'],
  revision: ['Revisión manual', 'Completa los datos a mano y decide: validar o rechazar'],
  pricecheck: ['Añadir a PriceCheck', 'Productos validados listos para entrar al flujo de precios'],
  validados: ['Productos validados', 'Información extraída de las imágenes y descarga en JSON o Excel'],
  rechazados: ['Rechazados', 'Archivo con la información de las capturas rechazadas'],
}

export const SIMULACIONES: { value: Simulacion; label: string }[] = [
  { value: 'exito', label: 'Aprobada' },
  { value: 'revision', label: 'Revisión manual' },
  { value: 'rechazada', label: 'Rechazada' },
  { value: 'error', label: 'Error técnico' },
]

/**
 * PROTOTIPO: aquí se fabrica el resultado del modelo.
 * Al conectar el backend se reemplaza por la respuesta de POST /api/validar.
 */
export function buildSimulated(
  sim: Simulacion,
  id: string,
  datos: CapturaForm,
  fotos: string[],
  fecha: string,
): { item: Captura; toast: string } {
  const producto = datos.producto.trim() || 'Detergente Ariel 900g'
  const codigo = datos.codigo.trim() || '7501234567890'
  const base = { id, fecha, fotos, tipo: 'regular' as const, origen: 'IA' as const, notas: '', errorMsg: '' }
  if (sim === 'exito')
    return {
      item: { ...base, status: 'validada', producto, codigo, precio: 68, confianza: 0.97, motivo: '—', explicacion: 'Producto, fachada y etiqueta coinciden con lo esperado.', val: OK },
      toast: `${id} aprobada · disponible en Productos validados`,
    }
  if (sim === 'revision')
    return {
      item: { ...base, status: 'revision', producto, codigo, precio: 68, confianza: 0.62, motivo: 'EVIDENCIA_DUDOSA', explicacion: 'La etiqueta es parcialmente legible; no se puede confirmar el precio unitario.', val: { f: 'ok', p: 'dudoso', c: 'ok', e: 'dudoso' } },
      toast: `${id} enviada a Revisión manual`,
    }
  if (sim === 'rechazada')
    return {
      item: { ...base, status: 'rechazada', producto, codigo, precio: 42.5, confianza: 0.12, motivo: 'PRODUCTO_NO_COINCIDE', explicacion: 'El producto de la foto es de otra marca que la esperada.', val: { f: 'ok', p: 'falla', c: 'ok', e: 'ok' } },
      toast: `${id} rechazada · guardada en Rechazados`,
    }
  return {
    item: { ...base, status: 'revision', producto: '', codigo: '', precio: null, confianza: null, motivo: 'ERROR_TECNICO', explicacion: '', errorMsg: 'No se pudo completar la validación (el servicio no respondió a tiempo).', val: NA },
    toast: `Error en la validación · ${id} enviada a Revisión manual`,
  }
}
