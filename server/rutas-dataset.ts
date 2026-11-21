import { createReadStream } from "node:fs";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { TIPOS_IMAGEN, type Captura, type ProveedorDataset, type TipoImagen } from "./dataset.ts";
import { ApiError } from "./errors.ts";
import { DECISIONES } from "./schemas.ts";

const ListaQuerySchema = z.object({
  decision: z.enum(DECISIONES).optional(),
  tienda: z.string().optional(),
  motivo: z.string().optional(),
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const TIPO_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

const urlsImagenes = (id: string) =>
  Object.fromEntries(
    TIPOS_IMAGEN.map((t) => [t, `/api/imagenes/${encodeURIComponent(id)}/${t}`]),
  ) as Record<TipoImagen, string>;

const conUrls = (c: Captura) => ({ ...c, imagenes: urlsImagenes(c.capture_id) });

const contar = <T>(items: T[], clave: (x: T) => string) => {
  const m: Record<string, number> = {};
  for (const x of items) m[clave(x)] = (m[clave(x)] ?? 0) + 1;
  return m;
};

export function registrarRutasDataset(app: FastifyInstance, obtener: ProveedorDataset) {
  app.get("/api/dataset/resumen", async () => {
    const ds = await obtener();
    return {
      total: ds.capturas.length,
      por_decision_esperada: contar(ds.capturas, (c) => c.decision_esperada ?? "sin_etiqueta"),
      por_motivo_rechazo: contar(
        ds.capturas.filter((c) => c.motivo_rechazo),
        (c) => c.motivo_rechazo!,
      ),
      por_tienda: contar(ds.capturas, (c) => c.capture_store_name),
      integridad: ds.reporte,
    };
  });

  app.get("/api/capturas", async (req) => {
    const ds = await obtener();
    const q = ListaQuerySchema.safeParse(req.query);
    if (!q.success) {
      throw new ApiError(400, "SOLICITUD_INVALIDA", q.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    }
    const { decision, tienda, motivo, q: texto, limit, offset } = q.data;
    const busca = texto?.toLowerCase();
    const filtradas = ds.capturas.filter(
      (c) =>
        (!decision || c.decision_esperada === decision) &&
        (!tienda || c.capture_store_name.toLowerCase() === tienda.toLowerCase()) &&
        (!motivo || c.motivo_rechazo === motivo) &&
        (!busca ||
          c.capture_id.toLowerCase().includes(busca) ||
          c.product_name.toLowerCase().includes(busca)),
    );
    return {
      total: filtradas.length,
      limit,
      offset,
      items: filtradas.slice(offset, offset + limit).map(conUrls),
    };
  });

  app.get<{ Params: { capture_id: string } }>("/api/capturas/:capture_id", async (req) => {
    const ds = await obtener();
    const c = ds.porId.get(req.params.capture_id);
    if (!c) throw new ApiError(404, "NO_ENCONTRADO", `Captura no encontrada: ${req.params.capture_id}`);
    return conUrls(c);
  });

  app.get<{ Params: { capture_id: string; tipo: string } }>(
    "/api/imagenes/:capture_id/:tipo",
    async (req, reply) => {
      const ds = await obtener();
      const { capture_id, tipo } = req.params;
      if (!ds.porId.has(capture_id)) {
        throw new ApiError(404, "NO_ENCONTRADO", `Captura no encontrada: ${capture_id}`);
      }
      if (!(TIPOS_IMAGEN as readonly string[]).includes(tipo)) {
        throw new ApiError(404, "NO_ENCONTRADO", `Tipo de imagen inválido: ${tipo} (usa ${TIPOS_IMAGEN.join(", ")})`);
      }
      const ruta = ds.rutas.get(capture_id)?.[tipo as TipoImagen];
      if (!ruta) {
        throw new ApiError(404, "NO_ENCONTRADO", `La imagen ${tipo} de ${capture_id} no existe en disco`);
      }
      const mime = TIPO_MIME[path.extname(ruta).toLowerCase()] ?? "application/octet-stream";
      return reply
        .type(mime)
        .header("cache-control", "public, max-age=3600")
        .send(createReadStream(ruta));
    },
  );
}
