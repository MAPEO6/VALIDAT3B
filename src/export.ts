import * as XLSX from 'xlsx'
import { toApiJson } from './mapping'
import type { Captura } from './types'

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function downloadJson(c: Captura) {
  save(new Blob([JSON.stringify(toApiJson(c), null, 2)], { type: 'application/json' }), `${c.id}.json`)
}

export function downloadExcel(items: Captura[]) {
  const rows = items.map((c) => ({
    capture_id: c.id,
    producto: c.producto,
    codigo_barras: c.codigo,
    precio: c.precio,
    tipo_precio: c.tipo,
    confianza: c.confianza,
    origen: c.origen,
    estado: c.status === 'enviada' ? 'Enviado a PriceCheck' : 'En cola de PriceCheck',
    fecha: c.fecha,
    json: JSON.stringify(toApiJson(c)),
  }))
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Validados')
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
  save(
    new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    'validados.xlsx',
  )
}
