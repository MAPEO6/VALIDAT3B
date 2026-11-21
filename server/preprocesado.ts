// Prepara las 3 imágenes de una captura y calcula señales baratas antes de llamar al modelo.
// No decide nada: las reglas (módulo 6) y el motor de decisión (módulo 7) usan este análisis.
import { leerCodigos, mismoCodigo } from "./codigo-barras.ts";
import type { IndiceDuplicados } from "./duplicados.ts";
import { hashPerceptual, nitidez, prepararParaModelo, tokensEstimados, type ImagenPreparada, type InfoImagen, type OpcionesImagen } from "./imagen.ts";

export const TIPOS = ["facade", "product", "shelf"] as const;
export type Tipo = (typeof TIPOS)[number];
export type Buffers = Record<Tipo, Buffer>;

export interface AnalisisImagen {
  original: InfoImagen;
  enviada: ImagenPreparada["enviada"];
  nitidez: number;
  hash: string;
  tokens_estimados: number;
}

export interface AnalisisCaptura {
  imagenes: Record<Tipo, AnalisisImagen>;
  codigo_barras: {
    leidos: string[]; // códigos válidos leídos en product + shelf
    coincide_esperado: boolean | null; // null si no hay código esperado
    leido_en: Tipo | null; // dónde apareció el esperado
  };
  duplicados: Record<"product" | "shelf", { capture_id: string; distancia: number } | null>;
  tokens_imagen_estimados: number;
  ms: number;
}

export interface SalidaPreprocesado {
  enviar: Record<Tipo, { buffer: Buffer; media_type: string }>;
  analisis: AnalisisCaptura;
}

export async function preprocesarCaptura(
  captureId: string,
  imagenes: Buffers,
  opts: { imagen?: OpcionesImagen; codigoEsperado?: string; indice?: IndiceDuplicados; leerBarras?: boolean } = {},
): Promise<SalidaPreprocesado> {
  const inicio = performance.now();
  const [prep, nit, hashes, codigosPorTipo] = await Promise.all([
    Promise.all(TIPOS.map((t) => prepararParaModelo(imagenes[t], opts.imagen))),
    Promise.all(TIPOS.map((t) => nitidez(imagenes[t]))),
    Promise.all(TIPOS.map((t) => hashPerceptual(imagenes[t]))),
    opts.leerBarras === false
      ? Promise.resolve([[], []] as string[][])
      : Promise.all((["product", "shelf"] as const).map((t) => leerCodigos(imagenes[t]).catch(() => [] as string[]))),
  ]);

  const analisisImagenes = {} as Record<Tipo, AnalisisImagen>;
  const enviar = {} as SalidaPreprocesado["enviar"];
  TIPOS.forEach((t, i) => {
    const p = prep[i]!;
    enviar[t] = { buffer: p.buffer, media_type: p.media_type };
    analisisImagenes[t] = {
      original: p.original,
      enviada: p.enviada,
      nitidez: nit[i]!,
      hash: hashes[i]!,
      tokens_estimados: tokensEstimados(p.enviada.ancho, p.enviada.alto),
    };
  });

  const [enProducto, enEtiqueta] = codigosPorTipo as [string[], string[]];
  const leidos = [...new Set([...enProducto, ...enEtiqueta])];
  const esperado = opts.codigoEsperado;
  const leidoEn: Tipo | null = esperado
    ? enProducto.some((c) => mismoCodigo(c, esperado)) ? "product" : enEtiqueta.some((c) => mismoCodigo(c, esperado)) ? "shelf" : null
    : null;

  const duplicados = {
    product: opts.indice?.buscarYRegistrar("product", captureId, analisisImagenes.product.hash) ?? null,
    shelf: opts.indice?.buscarYRegistrar("shelf", captureId, analisisImagenes.shelf.hash) ?? null,
  };

  return {
    enviar,
    analisis: {
      imagenes: analisisImagenes,
      codigo_barras: { leidos, coincide_esperado: esperado ? leidoEn !== null : null, leido_en: leidoEn },
      duplicados,
      tokens_imagen_estimados: TIPOS.reduce((s, t) => s + analisisImagenes[t].tokens_estimados, 0),
      ms: Math.round(performance.now() - inicio),
    },
  };
}
