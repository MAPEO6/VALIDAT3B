import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import { loadConfig, type Config } from "./config.ts";
import { REASON_CODES } from "./reason-codes.ts";
import { resultadoMock, resultadoTecnico } from "./mock.ts";
import {
  DECISIONES,
  MetaEntradaSchema,
  RespuestaValidarSchema,
  type CodigoError,
  type Decision,
  type ErrorRespuesta,
  type RespuestaValidar,
} from "./schemas.ts";

const CAMPOS_IMAGEN = ["fachada", "producto", "etiqueta"] as const;

class ApiError extends Error {
  status: number;
  code: CodigoError;
  constructor(status: number, code: CodigoError, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const cuerpoError = (code: CodigoError, message: string): ErrorRespuesta => ({
  error: { code, message },
});

// Si no se pide un mock concreto, se elige uno de forma determinista según el capture_id.
function decisionMock(captureId: string, pedida: unknown): Decision {
  if (typeof pedida === "string" && (DECISIONES as readonly string[]).includes(pedida)) {
    return pedida as Decision;
  }
  let h = 0;
  for (const ch of captureId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return DECISIONES[h % DECISIONES.length]!;
}

export function buildApp(config: Config = loadConfig()): FastifyInstance {
  const app = Fastify({ logger: { level: config.LOG_LEVEL } });

  app.register(multipart, {
    limits: { fileSize: config.MAX_UPLOAD_MB * 1024 * 1024, files: 3, fields: 10 },
  });

  app.setErrorHandler((err: FastifyError | ApiError, req, reply) => {
    if (err instanceof ApiError) {
      return reply.status(err.status).send(cuerpoError(err.code, err.message));
    }
    const code = (err as FastifyError).code;
    if (code === "FST_REQ_FILE_TOO_LARGE") {
      return reply
        .status(413)
        .send(
          cuerpoError(
            "ARCHIVO_DEMASIADO_GRANDE",
            `Cada imagen debe pesar máximo ${config.MAX_UPLOAD_MB} MB`,
          ),
        );
    }
    const status = (err as FastifyError).statusCode ?? 500;
    if (status >= 400 && status < 500) {
      return reply.status(status).send(cuerpoError("SOLICITUD_INVALIDA", err.message));
    }
    req.log.error(err);
    return reply.status(500).send(cuerpoError("ERROR_INTERNO", "Error interno del servidor"));
  });

  app.setNotFoundHandler((req, reply) =>
    reply
      .status(404)
      .send(cuerpoError("NO_ENCONTRADO", `Ruta no encontrada: ${req.method} ${req.url}`)),
  );

  app.get("/api/health", async () => ({
    status: "ok",
    modo: "mock", // cambiará cuando el pipeline real esté conectado
    modelo: config.FOUNDRY_MODEL,
  }));

  app.get("/api/reason-codes", async () => ({ reason_codes: REASON_CODES }));

  // Contrato definitivo; la lógica es simulada hasta el módulo 4.
  app.post<{ Querystring: { mock?: string } }>("/api/validar", async (req, reply) => {
    const inicio = performance.now();
    if (!req.isMultipart()) {
      throw new ApiError(400, "SOLICITUD_INVALIDA", "Se espera multipart/form-data");
    }

    let metaRaw: string | undefined;
    const imagenes = new Map<string, { bytes: number; mimetype: string }>();
    for await (const part of req.parts()) {
      if (part.type === "file") {
        const buf = await part.toBuffer(); // lanza FST_REQ_FILE_TOO_LARGE si excede el límite
        if ((CAMPOS_IMAGEN as readonly string[]).includes(part.fieldname)) {
          imagenes.set(part.fieldname, { bytes: buf.length, mimetype: part.mimetype });
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
    if (!meta.success) {
      throw new ApiError(400, "META_INVALIDA", "meta requiere al menos capture_id (string)");
    }

    const faltantes = CAMPOS_IMAGEN.filter((c) => !(imagenes.get(c)?.bytes ?? 0));
    if (faltantes.length > 0) {
      throw new ApiError(
        400,
        "IMAGENES_FALTANTES",
        `Faltan imágenes: ${faltantes.join(", ")} (se requieren fachada, producto y etiqueta)`,
      );
    }
    const noImagen = CAMPOS_IMAGEN.filter((c) => !imagenes.get(c)!.mimetype.startsWith("image/"));
    if (noImagen.length > 0) {
      throw new ApiError(400, "SOLICITUD_INVALIDA", `Archivo no es imagen: ${noImagen.join(", ")}`);
    }

    const captureId = meta.data.capture_id;
    let respuesta: RespuestaValidar;
    try {
      const resultado = resultadoMock(captureId, decisionMock(captureId, req.query.mock));
      respuesta = {
        resultado,
        usage: { input_tokens: 0, output_tokens: 0 },
        meta: { latencia_ms: Math.round(performance.now() - inicio), fuente_decision: "mock" },
      };
      RespuestaValidarSchema.parse(respuesta); // nunca enviar JSON que incumpla el contrato
    } catch (e) {
      // Fallo técnico → 200 con revision_manual (costo 1), nunca un 5xx ni una aprobación.
      req.log.error(e);
      respuesta = {
        resultado: resultadoTecnico(captureId, (e as Error).message),
        usage: { input_tokens: 0, output_tokens: 0 },
        meta: { latencia_ms: Math.round(performance.now() - inicio), fuente_decision: "error" },
      };
    }
    return reply.send(respuesta);
  });

  return app;
}
