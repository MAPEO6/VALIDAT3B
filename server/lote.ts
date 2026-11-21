// Procesa muchas capturas con concurrencia limitada. Cada resultado se escribe al terminar (JSONL),
// así una interrupción no pierde trabajo y se puede reanudar.
import { appendFile, readFile } from "node:fs/promises";

// Si el archivo quedó cortado a media línea (interrupción), agrega el salto para no pegar el siguiente registro.
export async function asegurarFinDeLinea(ruta: string): Promise<void> {
  try {
    const t = await readFile(ruta, "utf-8");
    if (t.length && !t.endsWith("\n")) await appendFile(ruta, "\n");
  } catch {
    // no existe todavía
  }
}
import { TIPOS_IMAGEN, type Captura, type Dataset } from "./dataset.ts";
import { resultadoTecnico } from "./mock.ts";
import { campoDesdeCaptura, contextoDesdeCaptura, validarCaptura, type OpcionesPipeline, type SalidaPipeline } from "./pipeline.ts";
import type { Resultado } from "./schemas.ts";

export interface RegistroLote {
  capture_id: string;
  resultado: Resultado;
  usage: SalidaPipeline["usage"];
  fuente_decision: SalidaPipeline["fuente_decision"];
  intentos_modelo: number;
  ms: number;
  ia: SalidaPipeline["ia"] | null;
  reglas: SalidaPipeline["reglas"];
  codigo_barras: NonNullable<SalidaPipeline["analisis"]>["codigo_barras"] | null;
  tokens_imagen_estimados: number | null;
}

export async function leerRegistros(ruta: string): Promise<RegistroLote[]> {
  let texto: string;
  try {
    texto = await readFile(ruta, "utf-8");
  } catch {
    return [];
  }
  const porId = new Map<string, RegistroLote>();
  for (const linea of texto.split(/\r?\n/)) {
    if (!linea.trim()) continue;
    try {
      const r = JSON.parse(linea) as RegistroLote;
      porId.set(r.capture_id, r); // la última línea de cada captura gana (reintentos)
    } catch {
      // línea cortada por una interrupción: se ignora y la captura se reprocesa
    }
  }
  return [...porId.values()];
}

export async function procesarCaptura(ds: Dataset, c: Captura, opts: OpcionesPipeline): Promise<RegistroLote> {
  const inicio = performance.now();
  let s: SalidaPipeline;
  try {
    const rutas = ds.rutas.get(c.capture_id)!;
    const faltan = TIPOS_IMAGEN.filter((t) => !rutas[t]);
    if (faltan.length) throw new Error(`faltan imágenes en disco: ${faltan.join(", ")}`);
    const [facade, product, shelf] = await Promise.all(TIPOS_IMAGEN.map((t) => readFile(rutas[t]!)));
    s = await validarCaptura(
      { contexto: contextoDesdeCaptura(c), campo: campoDesdeCaptura(c), imagenes: { facade: facade!, product: product!, shelf: shelf! } },
      opts,
    );
  } catch (e) {
    s = { resultado: resultadoTecnico(c.capture_id, (e as Error).message), usage: { input_tokens: 0, output_tokens: 0 }, fuente_decision: "error", intentos_modelo: 0, reglas: [] };
  }
  return {
    capture_id: c.capture_id,
    resultado: s.resultado,
    usage: s.usage,
    fuente_decision: s.fuente_decision,
    intentos_modelo: s.intentos_modelo,
    ms: Math.round(performance.now() - inicio),
    ia: s.ia ?? null,
    reglas: s.reglas,
    codigo_barras: s.analisis?.codigo_barras ?? null,
    tokens_imagen_estimados: s.analisis?.tokens_imagen_estimados ?? null,
  };
}

export async function procesarLote(
  ds: Dataset,
  capturas: Captura[],
  opts: OpcionesPipeline,
  salida: string,
  concurrencia: number,
  alTerminar?: (r: RegistroLote, hechas: number) => void,
): Promise<RegistroLote[]> {
  await asegurarFinDeLinea(salida);
  const cola = [...capturas];
  const hechos: RegistroLote[] = [];
  const trabajador = async () => {
    for (let c = cola.shift(); c; c = cola.shift()) {
      const r = await procesarCaptura(ds, c, opts);
      await appendFile(salida, JSON.stringify(r) + "\n");
      hechos.push(r);
      alTerminar?.(r, hechos.length);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrencia) }, trabajador));
  return hechos;
}

// JSON oficial final: una entrada por captura del dataset, en su orden. Si falta alguna, revisión manual.
export function exportarFinal(capturas: Captura[], registros: RegistroLote[]): Resultado[] {
  const porId = new Map(registros.map((r) => [r.capture_id, r.resultado]));
  return capturas.map((c) => porId.get(c.capture_id) ?? resultadoTecnico(c.capture_id, "captura no procesada"));
}
