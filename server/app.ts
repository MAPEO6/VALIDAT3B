import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import { loadConfig, opcionesFoundry, type Config } from "./config.ts";
import { crearProveedorDataset, type ProveedorDataset } from "./dataset.ts";
import { ApiError, cuerpoError } from "./errors.ts";
import { REASON_CODES } from "./reason-codes.ts";
import { registrarRutasDataset } from "./rutas-dataset.ts";
import { registrarRutasValidacion } from "./rutas-validacion.ts";

export interface DepsApp {
  dataset?: ProveedorDataset; // inyectable en pruebas
  fetchImpl?: typeof fetch; // inyectable en pruebas (Foundry simulado)
}

export function buildApp(config: Config = loadConfig(), deps: DepsApp = {}): FastifyInstance {
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
        .send(cuerpoError("ARCHIVO_DEMASIADO_GRANDE", `Cada imagen debe pesar máximo ${config.MAX_UPLOAD_MB} MB`));
    }
    const status = (err as FastifyError).statusCode ?? 500;
    if (status >= 400 && status < 500) {
      return reply.status(status).send(cuerpoError("SOLICITUD_INVALIDA", err.message));
    }
    req.log.error(err);
    return reply.status(500).send(cuerpoError("ERROR_INTERNO", "Error interno del servidor"));
  });

  app.setNotFoundHandler((req, reply) =>
    reply.status(404).send(cuerpoError("NO_ENCONTRADO", `Ruta no encontrada: ${req.method} ${req.url}`)),
  );

  const dataset =
    deps.dataset ??
    crearProveedorDataset({ dir: config.DATA_DIR, capturasFile: config.CAPTURAS_FILE, catalogoFile: config.CATALOGO_FILE });

  app.get("/api/health", async () => ({
    status: "ok",
    modo: opcionesFoundry(config) ? "ia" : "sin_foundry",
    modelo: config.FOUNDRY_MODEL,
  }));
  app.get("/api/reason-codes", async () => ({ reason_codes: REASON_CODES }));

  registrarRutasDataset(app, dataset);
  registrarRutasValidacion(app, config, dataset, deps.fetchImpl);

  return app;
}
