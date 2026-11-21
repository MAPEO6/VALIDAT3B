export type View = 'nueva' | 'revision' | 'pricecheck' | 'validados' | 'rechazados'
export type Status = 'validada' | 'enviada' | 'revision' | 'rechazada'
export type Origen = 'IA' | 'Manual'
export type TipoPrecio = 'regular' | 'oferta' | 'volumen'
/** 'ok' | 'falla' vienen del contrato; 'na' = sin datos (error técnico o captura manual). */
export type Val = 'ok' | 'falla' | 'na'
/** Forzar resultado del backend simulado (?mock=). 'auto' = según capture_id. */
export type MockOpcion = 'auto' | 'aprobada' | 'rechazada' | 'revision_manual'
export type Fuente = 'mock' | 'regla' | 'ia' | 'error'
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
  /** meta.fuente_decision del backend (solo capturas validadas por el servidor). */
  fuente?: Fuente
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
  ancho: number
  alto: number
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
