export type View = 'nueva' | 'revision' | 'pricecheck' | 'validados' | 'rechazados'
export type Status = 'validada' | 'enviada' | 'revision' | 'rechazada'
export type Origen = 'IA' | 'Manual'
export type TipoPrecio = 'regular' | 'oferta' | 'volumen'
export type Val = 'ok' | 'falla' | 'dudoso' | 'na'
export type Simulacion = 'exito' | 'revision' | 'rechazada' | 'error'
export type Fase = 'idle' | 'loading' | 'done' | 'error'
export type CheckKey = 'fachada' | 'producto' | 'codigo' | 'etiqueta' | 'precio'
export type Mode = 'secuencial' | 'masiva'

export interface Validaciones {
  f: Val
  p: Val
  c: Val
  e: Val
}

export interface Captura {
  id: string
  producto: string
  codigo: string
  precio: number | null
  tipo: TipoPrecio
  confianza: number | null
  origen: Origen
  status: Status
  motivo: string
  explicacion: string
  errorMsg: string
  notas: string
  val: Validaciones
  fecha: string
  /** Miniaturas (object URLs) de las 3 fotos, solo para capturas creadas en esta sesión. */
  fotos?: string[]
}

export interface Lote {
  label: string
  fecha: string
}

export interface Foto {
  file: File
  url: string
}

export interface CapturaForm {
  captureId: string
  codigo: string
  producto: string
}

export interface RevForm {
  producto: string
  codigo: string
  precio: string
  tipo: TipoPrecio
  notas: string
}
