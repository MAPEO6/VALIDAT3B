// Valida UNA captura: imágenes + contexto → modelo → JSON oficial.
// Cualquier fallo técnico termina en revision_manual (costo 1), nunca en aprobada.
import type { Captura } from "./dataset.ts";
import type { IndiceDuplicados } from "./duplicados.ts";
import type { OpcionesImagen } from "./imagen.ts";
import { OPCIONES_REGLAS_DEFECTO, piden_revision, reglasPosteriores, reglasPrevias, resumen, type DatosCampo, type OpcionesReglas, type Senal } from "./reglas.ts";
import { preprocesarCaptura, type AnalisisCaptura, type SalidaPreprocesado } from "./preprocesado.ts";
import { FoundryError, llamarModelo, type ContentBlock, type OpcionesFoundry, type Usage } from "./foundry.ts";
import { resultadoTecnico } from "./mock.ts";
import { RespuestaIASchema, SYSTEM_PROMPT, extraerJson, textoUsuario, type ContextoCaptura, type RespuestaIA } from "./prompt.ts";
import { ResultadoSchema, type Decision, type Resultado } from "./schemas.ts";

export interface ImagenesCaptura {
  facade: Buffer;
  product: Buffer;
  shelf: Buffer;
}

export interface EntradaPipeline {
  contexto: ContextoCaptura; // lo que ve el modelo
  imagenes: ImagenesCaptura;
  campo?: DatosCampo; // datos de campo para las reglas (no se envían al modelo)
}

export interface SalidaPipeline {
  resultado: Resultado;
  usage: Usage;
  fuente_decision: "ia" | "regla" | "error";
  intentos_modelo: number;
  respuesta_modelo?: string; // texto crudo, solo para depuración
  analisis?: AnalisisCaptura; // señales locales (módulo 5) para reglas y decisión
  reglas: Senal[]; // señales de las reglas deterministas (módulo 6)
}

export interface OpcionesPipeline {
  foundry: OpcionesFoundry | null; // null = Foundry no configurado
  maxTokens?: number;
  reintentosFormato?: number; // reintentos si el modelo no devuelve JSON válido
  umbralAprobacion?: number;
  imagen?: OpcionesImagen; // tamaño y calidad de lo que se envía al modelo
  indiceDuplicados?: IndiceDuplicados; // compartido entre capturas (API o lote)
  leerCodigos?: boolean; // lectura local de código de barras (default: sí)
  reglas?: OpcionesReglas;
}

// PROVISIONAL (lo reemplaza el motor de decisión del módulo 7).
export const UMBRAL_APROBACION = 0.95;

// Tipos que acepta el modelo, detectados por los bytes (no por la extensión ni el mimetype recibido).
export function detectarMediaType(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (buf.length >= 6 && /^GIF8[79]a$/.test(buf.toString("ascii", 0, 6))) return "image/gif";
  return null;
}

export function campoDesdeCaptura(c: Captura): DatosCampo {
  return {
    codigo_capturado: c.capture_barcode,
    codigo_esperado: c.product_barcode,
    precio_capturado: c.capture_price,
    precio_min: c.min_product_price,
    precio_max: c.max_product_price,
  };
}

export function contextoDesdeCaptura(c: Captura): ContextoCaptura {
  return {
    capture_id: c.capture_id,
    tienda: c.capture_store_name,
    producto: c.product_name,
    marca: c.capture_brand,
    contenido: `${c.unit_quantity_product} ${c.unit_product}`,
    codigo_barras_esperado: c.product_barcode,
  };
}

export function construirContenido(contexto: ContextoCaptura, enviar: SalidaPreprocesado["enviar"]): ContentBlock[] {
  const bloques: ContentBlock[] = [];
  const etiquetas: [keyof ImagenesCaptura, string][] = [
    ["facade", "Imagen 1: FACHADA"],
    ["product", "Imagen 2: PRODUCTO"],
    ["shelf", "Imagen 3: ETIQUETA DE PRECIO"],
  ];
  for (const [tipo, titulo] of etiquetas) {
    const img = enviar[tipo];
    bloques.push({ type: "text", text: titulo });
    bloques.push({ type: "image", source: { type: "base64", media_type: img.media_type, data: img.buffer.toString("base64") } });
  }
  bloques.push({ type: "text", text: textoUsuario(contexto) });
  return bloques;
}

// Confianza en la decisión emitida (no en que la captura sea válida):
// aprobada → p · rechazada → 1−p · revisión → qué tan ambigua es (1 cuando p = 0.5).
export function confianzaDe(decision: Decision, p: number): number {
  const c = decision === "aprobada" ? p : decision === "rechazada" ? 1 - p : 1 - Math.abs(2 * p - 1);
  return Math.round(c * 100) / 100;
}

// Guardas mínimas PROVISIONALES (el módulo 7 las sustituye por el motor de decisión).
export function aResultado(captureId: string, ia: RespuestaIA, umbral = UMBRAL_APROBACION): Resultado {
  const todasOk = Object.values(ia.validaciones).every((v) => v === "ok");
  const algunaFalla = !todasOk;
  let decision: Decision = ia.decision;
  let nota = "";

  if (decision === "aprobada" && !(todasOk && ia.probabilidad_valida >= umbral)) {
    decision = "revision_manual";
    nota = " (Enviada a revisión: no cumple el umbral de aprobación.)";
  }
  if (decision === "rechazada" && !(ia.reason_code && algunaFalla)) {
    decision = "revision_manual";
    nota = " (Enviada a revisión: rechazo sin motivo o sin validación fallida.)";
  }

  return {
    capture_id: captureId,
    decision,
    confidence_score: confianzaDe(decision, ia.probabilidad_valida),
    reason_code: decision === "rechazada" ? ia.reason_code : null,
    validaciones: ia.validaciones,
    precio_detectado: ia.precio_detectado,
    codigo_barras_detectado: ia.codigo_barras_detectado,
    explicacion: `${ia.explicacion}${nota}`,
  };
}

// Revisión manual decidida por reglas, sin modelo. Convención: lo no verificado se reporta como "falla".
export function resultadoPorRegla(captureId: string, senales: Senal[]): Resultado {
  return ResultadoSchema.parse({
    capture_id: captureId,
    decision: "revision_manual",
    confidence_score: 1,
    reason_code: null,
    validaciones: { tienda_fachada: "falla", producto: "falla", codigo_barras: "falla", evidencia_precio: "falla" },
    precio_detectado: null,
    codigo_barras_detectado: null,
    explicacion: `Revisión manual por reglas: ${resumen(senales)}.`,
  });
}

const sumar = (a: Usage, b: Usage): Usage => ({
  input_tokens: a.input_tokens + b.input_tokens,
  output_tokens: a.output_tokens + b.output_tokens,
});

export async function validarCaptura(entrada: EntradaPipeline, opts: OpcionesPipeline): Promise<SalidaPipeline> {
  const id = entrada.contexto.capture_id;
  let usage: Usage = { input_tokens: 0, output_tokens: 0 };
  let intentos = 0;
  let ultimoTexto: string | undefined;
  let analisis: AnalisisCaptura | undefined;
  let reglas: Senal[] = [];
  const error = (motivo: string): SalidaPipeline => ({
    resultado: resultadoTecnico(id, motivo),
    usage,
    fuente_decision: "error",
    intentos_modelo: intentos,
    respuesta_modelo: ultimoTexto,
    analisis,
    reglas,
  });

  // 1) Preprocesado local (sharp + código de barras + duplicados). Una imagen ilegible es error técnico.
  for (const [tipo, buf] of Object.entries(entrada.imagenes)) {
    if (!detectarMediaType(buf)) return error(`la imagen ${tipo} no es JPEG, PNG, WEBP ni GIF`);
  }
  let pre: SalidaPreprocesado;
  try {
    pre = await preprocesarCaptura(id, entrada.imagenes, {
      imagen: opts.imagen,
      codigoEsperado: entrada.contexto.codigo_barras_esperado,
      indice: opts.indiceDuplicados,
      leerBarras: opts.leerCodigos,
    });
    analisis = pre.analisis;
  } catch (e) {
    return error(`no se pudo procesar la imagen: ${(e as Error).message}`);
  }

  // 2) Reglas previas: si alguna pide revisión, no tiene caso gastar tokens (nunca se podría aprobar).
  const campo = entrada.campo ?? {};
  reglas = reglasPrevias(campo, analisis);
  const bloquean = piden_revision(reglas);
  if (bloquean.length) {
    return {
      resultado: resultadoPorRegla(id, bloquean),
      usage,
      fuente_decision: "regla",
      intentos_modelo: 0,
      analisis,
      reglas,
    };
  }

  // 3) Modelo.
  if (!opts.foundry) return error("Foundry no configurado (FOUNDRY_API_KEY / FOUNDRY_ENDPOINT)");
  const contenido = construirContenido(entrada.contexto, pre.enviar);

  const reintentosFormato = opts.reintentosFormato ?? 1;
  let ultimoProblema = "";
  for (let i = 0; i <= reintentosFormato; i++) {
    try {
      const r = await llamarModelo(opts.foundry, { system: SYSTEM_PROMPT, content: contenido, maxTokens: opts.maxTokens ?? 500 });
      intentos += r.intentos;
      usage = sumar(usage, r.usage);
      ultimoTexto = r.text;
      const ia = RespuestaIASchema.parse(extraerJson(r.text));
      let resultado = ResultadoSchema.parse(aResultado(id, ia, opts.umbralAprobacion));
      // 4) Reglas posteriores: una discrepancia nunca deja pasar una aprobación.
      const post = reglasPosteriores(campo, ia.precio_detectado, opts.reglas ?? OPCIONES_REGLAS_DEFECTO);
      reglas = [...reglas, ...post];
      const revisar = piden_revision(post);
      if (revisar.length && resultado.decision === "aprobada") {
        resultado = ResultadoSchema.parse({
          ...resultado,
          decision: "revision_manual",
          confidence_score: confianzaDe("revision_manual", ia.probabilidad_valida),
          explicacion: `${resultado.explicacion} (Enviada a revisión: ${resumen(revisar)}.)`,
        });
      }
      return { resultado, usage, fuente_decision: "ia", intentos_modelo: intentos, respuesta_modelo: r.text, analisis, reglas };
    } catch (e) {
      if (e instanceof FoundryError) return error(e.message); // ya reintentó lo transitorio
      ultimoProblema = `respuesta del modelo inválida: ${(e as Error).message.slice(0, 200)}`;
    }
  }
  return error(ultimoProblema);
}
