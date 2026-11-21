// Índice en memoria de fotos ya vistas, para detectar fotos reutilizadas entre capturas.
// Solo se usa para `product` y `shelf`: las fachadas se repiten por diseño (misma tienda).
import { distanciaHamming } from "./imagen.ts";

export type TipoDuplicable = "product" | "shelf";

export interface Coincidencia {
  capture_id: string;
  distancia: number;
}

export class IndiceDuplicados {
  private vistos: Record<TipoDuplicable, { capture_id: string; hash: string }[]> = { product: [], shelf: [] };
  private umbral: number;
  constructor(umbral = 4) {
    this.umbral = umbral;
  }

  // Devuelve la captura previa más parecida (si la hay) y registra la actual.
  buscarYRegistrar(tipo: TipoDuplicable, captureId: string, hash: string): Coincidencia | null {
    let mejor: Coincidencia | null = null;
    for (const v of this.vistos[tipo]) {
      if (v.capture_id === captureId) continue;
      const d = distanciaHamming(v.hash, hash);
      if (d <= this.umbral && (!mejor || d < mejor.distancia)) mejor = { capture_id: v.capture_id, distancia: d };
    }
    if (!this.vistos[tipo].some((v) => v.capture_id === captureId)) this.vistos[tipo].push({ capture_id: captureId, hash });
    return mejor;
  }
}
