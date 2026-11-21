/**
 * Traducción entre el contrato del backend (server/schemas.ts) y el modelo de la UI.
 * Funciones puras: se prueban en tests/frontend.test.ts.
 */
import type { RespuestaValidar } from '../server/schemas.ts'
import type { Captura, CapturaForm, Val } from './types.ts'

/** Textos en lenguaje del usuario para cada reason_code (el código se muestra aparte). */
export const REASON_LABELS: Record<string, string> = {
  PRODUCTO_NO_COINCIDE: 'El producto no coincide con el esperado',
  DESCRIPCION_INCOMPLETA: 'Descripción de producto incompleta',
  CAPTURA_LEJANA: 'Foto tomada demasiado lejos',
  CAPTURA_BORROSA: 'Foto borrosa',
  FACHADA_INCORRECTA: 'La fachada no corresponde a la tienda',
  SIN_ETIQUETA_O_PRECIO: 'No se ve la etiqueta o el precio',
  ERROR_TECNICO: 'Error técnico al validar',
  BAJA_CONFIANZA: 'El modelo no está seguro',
}

export const motivoTexto = (codigo: string) => REASON_LABELS[codigo] ?? codigo

/** Motivo a mostrar: reason_code si existe; si no, por qué está en revisión. */
export function motivoDe(c: Pick<Captura, 'motivo' | 'status' | 'fuente'>): string {
  if (c.motivo && c.motivo !== '—') return c.motivo
  if (c.fuente === 'error') return 'ERROR_TECNICO'
  if (c.status === 'revision') return 'BAJA_CONFIANZA'
  return '—'
}

const val = (v: 'ok' | 'falla'): Val => v

/** Respuesta 200 de POST /api/validar → captura de la UI. */
export function resultadoACaptura(
  resp: RespuestaValidar,
  datos: CapturaForm,
  fotos: string[],
  fecha: string,
): Captura {
  const r = resp.resultado
  const esError = resp.meta.fuente_decision === 'error'
  const status = r.decision === 'aprobada' ? 'validada' : r.decision === 'rechazada' ? 'rechazada' : 'revision'
  return {
    id: r.capture_id,
    producto: datos.producto.trim(),
    codigo: r.codigo_barras_detectado ?? datos.codigo.trim(),
    precio: r.precio_detectado,
    tipo: 'regular',
    confianza: esError ? null : r.confidence_score,
    origen: 'IA',
    fuente: resp.meta.fuente_decision,
    status,
    motivo: r.reason_code ?? (esError ? 'ERROR_TECNICO' : '—'),
    explicacion: esError ? '' : r.explicacion,
    errorMsg: esError ? r.explicacion : '',
    notas: '',
    // En un error técnico nada se verificó: se muestra "sin datos" en vez de "falla".
    val: esError
      ? { f: 'na', p: 'na', c: 'na', e: 'na' }
      : {
          f: val(r.validaciones.tienda_fachada),
          p: val(r.validaciones.producto),
          c: val(r.validaciones.codigo_barras),
          e: val(r.validaciones.evidencia_precio),
        },
    fecha,
    fotos,
  }
}

/** Captura sin respuesta del servidor (red caída, timeout, respuesta fuera de contrato). */
export function capturaErrorTecnico(
  id: string,
  datos: CapturaForm,
  fotos: string[],
  fecha: string,
  mensaje: string,
): Captura {
  return {
    id,
    producto: datos.producto.trim(),
    codigo: datos.codigo.trim(),
    precio: null,
    tipo: 'regular',
    confianza: null,
    origen: 'IA',
    fuente: 'error',
    status: 'revision',
    motivo: 'ERROR_TECNICO',
    explicacion: '',
    errorMsg: mensaje,
    notas: '',
    val: { f: 'na', p: 'na', c: 'na', e: 'na' },
    fecha,
    fotos,
  }
}

const aContrato = (v: Val): 'ok' | 'falla' => (v === 'ok' ? 'ok' : 'falla')

/** Captura de la UI → JSON con la forma de `resultado` de /api/validar (descargas). */
export function toApiJson(c: Captura) {
  const decision = c.status === 'rechazada' ? 'rechazada' : c.status === 'revision' ? 'revision_manual' : 'aprobada'
  return {
    capture_id: c.id,
    decision,
    // Una decisión manual no tiene puntaje del modelo: el revisor la confirma (1).
    confidence_score: c.confianza ?? (c.origen === 'Manual' ? 1 : 0),
    reason_code: decision === 'rechazada' && c.motivo !== '—' ? c.motivo : null,
    validaciones: {
      tienda_fachada: aContrato(c.val.f),
      producto: aContrato(c.val.p),
      codigo_barras: aContrato(c.val.c),
      evidencia_precio: aContrato(c.val.e),
    },
    precio_detectado: c.precio,
    codigo_barras_detectado: c.codigo || null,
    explicacion: c.explicacion || c.notas || (c.origen === 'Manual' ? 'Decisión del revisor.' : 'Sin explicación.'),
    // Campos extra de la UI (no forman parte del contrato del modelo).
    origen: c.origen,
    tipo_precio: c.tipo,
  }
}
