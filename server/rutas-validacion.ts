import { readFile } from "node:fs/promises";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { opcionesFoundry, opcionesImagen, type Config } from "./config.ts";
import { IndiceDuplicados } from "./duplicados.ts";
import { TIPOS_IMAGEN, type ProveedorDataset } from "./dataset.ts";
import { ApiError } from "./errors.ts";
import { resultadoMock } from "./mock.ts";
import { contextoDesdeCaptura, validarCaptura, type EntradaPipeline, type ImagenesCaptura, type SalidaPipeline } from "./pipeline.ts";
import type { ContextoCaptura } from "./prompt.ts";
import { DECISIONES, MetaEntradaSchema, RespuestaValidarSchema, type Decision, type RespuestaValidar } from "./schemas.ts";

// Campos del formulario → tipo de imagen interno.
const CAMPOS_IMAGEN = { fachada: "facade", producto: "product", etiqueta: "shelf" } as const;
type Query = { mock?: string; debug?: string };

function decisionMock(captureId: string, pedida: string): Decision {
  if ((DECISIONES as readonly string[]).includes(pedida)) return pedida as Decision;
  let h = 0;
  for (const ch of captureId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return DECISIONES[h % DECISIONES.length]!;
}

export function registrarRutasValidacion(
  app: FastifyInstance,
  config: Config,
  obtenerDataset: ProveedorDataset,
  fetchImpl?: typeof fetch,
) {
  const foundryBase = opcionesFoundry(config);
  const foundry = foundryBase ? { ...foundryBase, fetchImpl } : null;
  // Un índice por proceso: detecta fotos de producto/etiqueta reutilizadas entre capturas validadas.
  const indiceDuplicados = new IndiceDuplicados(config.DUP_UMBRAL_HAMMING);

  async function responder(req: FastifyRequest<{ Querystring: Query }>, entrada: EntradaPipeline): Promise<RespuestaValidar> {
    const inicio = performance.now();
    const id = entrada.contexto.capture_id;
    const latencia = () => Math.round(performance.now() - inicio);

    // ?mock=... fuerza una respuesta simulada (útil para el frontend sin gastar tokens).
    if (req.query.mock !== undefined) {
      return {
        resultado: resultadoMock(id, decisionMock(id, req.query.mock)),
        usage: { input_tokens: 0, output_tokens: 0 },
        meta: { latencia_ms: latencia(), fuente_decision: "mock" },
      };
    }

    const salida: SalidaPipeline = await validarCaptura(entrada, {
      foundry,
      maxTokens: config.MAX_TOKENS_SALIDA,
      imagen: opcionesImagen(config),
      indiceDuplicados,
      leerCodigos: config.LEER_CODIGOS,
    });
    const respuesta: RespuestaValidar = {
      resultado: salida.resultado,
      usage: salida.usage,
      meta: { latencia_ms: latencia(), fuente_decision: salida.fuente_decision },
    };
    if (req.query.debug === "1") {
      respuesta.debug = {
        respuesta_modelo: salida.respuesta_modelo ?? null,
        intentos_modelo: salida.intentos_modelo,
        analisis_imagenes: salida.analisis,
      };
    }
    req.log.info(
      { capture_id: id, decision: salida.resultado.decision, fuente: salida.fuente_decision, usage: salida.usage, intentos: salida.intentos_modelo, ms: latencia(), ms_imagenes: salida.analisis?.ms, codigo_ok: salida.analisis?.codigo_barras.coincide_esperado },
      "validacion",
    );
    if (salida.fuente_decision === "error") req.log.warn({ capture_id: id, motivo: salida.resultado.explicacion }, "validacion con error tecnico");
    RespuestaValidarSchema.parse(respuesta); // el contrato nunca se rompe
    return respuesta;
  }

  // Sube 3 imágenes + meta (formulario). Si el capture_id está en el dataset, usa sus datos esperados.
  app.post<{ Querystring: Query }>("/api/validar", async (req) => {
    if (!req.isMultipart()) throw new ApiError(400, "SOLICITUD_INVALIDA", "Se espera multipart/form-data");

    let metaRaw: string | undefined;
    const imagenes: Partial<ImagenesCaptura> = {};
    const mimes: Record<string, string> = {};
    for await (const part of req.parts()) {
      if (part.type === "file") {
        const buf = await part.toBuffer(); // lanza FST_REQ_FILE_TOO_LARGE si excede el límite
        const tipo = CAMPOS_IMAGEN[part.fieldname as keyof typeof CAMPOS_IMAGEN];
        if (tipo && buf.length > 0) {
          imagenes[tipo] = buf;
          mimes[part.fieldname] = part.mimetype;
        }
      } else if (part.fieldname === "meta") {
        metaRaw = String(part.value);
      }
    }

    let metaJson: unknown;
    try {
      metaJson = JSON.parse(metaRaw ?? "");
    } catch {
      throw new ApiError(400, "META_INVALIDA", "El campo meta debe ser JSON válido");
    }
    const meta = MetaEntradaSchema.safeParse(metaJson);
    if (!meta.success) throw new ApiError(400, "META_INVALIDA", "meta requiere al menos capture_id (string)");

    const faltantes = Object.entries(CAMPOS_IMAGEN).filter(([, t]) => !imagenes[t]).map(([campo]) => campo);
    if (faltantes.length) {
      throw new ApiError(400, "IMAGENES_FALTANTES", `Faltan imágenes: ${faltantes.join(", ")} (se requieren fachada, producto y etiqueta)`);
    }
    const noImagen = Object.entries(mimes).filter(([, m]) => !m.startsWith("image/")).map(([c]) => c);
    if (noImagen.length) throw new ApiError(400, "SOLICITUD_INVALIDA", `Archivo no es imagen: ${noImagen.join(", ")}`);

    let contexto: ContextoCaptura = {
      capture_id: meta.data.capture_id,
      tienda: meta.data.tienda,
      producto: meta.data.producto_esperado,
      marca: meta.data.marca,
      contenido: meta.data.contenido,
      codigo_barras_esperado: meta.data.codigo_barras === undefined ? undefined : String(meta.data.codigo_barras),
    };
    try {
      const c = (await obtenerDataset()).porId.get(meta.data.capture_id);
      if (c) contexto = contextoDesdeCaptura(c);
    } catch {
      // Sin dataset se usan los datos del formulario.
    }
    return responder(req, { contexto, imagenes: imagenes as ImagenesCaptura });
  });

  // Valida una captura del dataset leyendo sus imágenes de disco (no hay que subir nada).
  app.post<{ Params: { capture_id: string }; Querystring: Query }>("/api/capturas/:capture_id/validar", async (req) => {
    const ds = await obtenerDataset();
    const c = ds.porId.get(req.params.capture_id);
    if (!c) throw new ApiError(404, "NO_ENCONTRADO", `Captura no encontrada: ${req.params.capture_id}`);
    const rutas = ds.rutas.get(c.capture_id)!;
    const faltan = TIPOS_IMAGEN.filter((t) => !rutas[t]);
    if (faltan.length) {
      throw new ApiError(400, "IMAGENES_FALTANTES", `La captura ${c.capture_id} no tiene en disco: ${faltan.join(", ")}`);
    }
    const [facade, product, shelf] = await Promise.all(TIPOS_IMAGEN.map((t) => readFile(rutas[t]!)));
    return responder(req, { contexto: contextoDesdeCaptura(c), imagenes: { facade: facade!, product: product!, shelf: shelf! } });
  });
}
