import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(25),
  // Dataset del reto: carpeta con capturas.json, catalogo_productos.csv e imagenes/
  DATA_DIR: z.string().default("./data"),
  CAPTURAS_FILE: z.string().default("capturas.json"),
  CATALOGO_FILE: z.string().default("catalogo_productos.csv"),
  // Foundry: si falta la llave o el endpoint, las validaciones devuelven revision_manual (error técnico).
  FOUNDRY_API_KEY: z.string().optional(),
  FOUNDRY_ENDPOINT: z.string().optional(),
  FOUNDRY_MODEL: z.string().default("claude-haiku-5-5"),
  FOUNDRY_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  FOUNDRY_REINTENTOS: z.coerce.number().int().min(0).max(5).default(2),
  MAX_TOKENS_SALIDA: z.coerce.number().int().positive().default(500),
  // Imágenes enviadas al modelo: caben en 1024×768 (o 768×1024), sin agrandar.
  IMG_LADO_LARGO: z.coerce.number().int().min(256).default(1024),
  IMG_LADO_CORTO: z.coerce.number().int().min(256).default(768),
  IMG_CALIDAD_JPEG: z.coerce.number().int().min(40).max(100).default(85),
  DUP_UMBRAL_HAMMING: z.coerce.number().int().min(0).max(32).default(4),
  // Reglas: qué hacer si el precio leído en la etiqueta ≠ capture_price
  REGLA_PRECIO_DISCREPANCIA: z.enum(["revision", "ignorar"]).default("revision"),
  PRECIO_TOLERANCIA: z.coerce.number().min(0).default(0.01),
  LEER_CODIGOS: z.enum(["true", "false"]).default("true").transform((v) => v === "true"),
});

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const detalle = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Configuración inválida (.env): ${detalle}`);
  }
  return parsed.data;
}

export function opcionesFoundry(c: Config) {
  const apiKey = c.FOUNDRY_API_KEY?.trim();
  const endpoint = c.FOUNDRY_ENDPOINT?.trim();
  if (!apiKey || !endpoint) return null;
  return {
    apiKey,
    endpoint,
    model: c.FOUNDRY_MODEL,
    timeoutMs: c.FOUNDRY_TIMEOUT_MS,
    reintentos: c.FOUNDRY_REINTENTOS,
  };
}

export const opcionesImagen = (c: Config) => ({
  ladoLargo: c.IMG_LADO_LARGO,
  ladoCorto: c.IMG_LADO_CORTO,
  calidadJpeg: c.IMG_CALIDAD_JPEG,
});

export const opcionesReglas = (c: Config) => ({
  precioDiscrepancia: c.REGLA_PRECIO_DISCREPANCIA,
  toleranciaPrecio: c.PRECIO_TOLERANCIA,
});
