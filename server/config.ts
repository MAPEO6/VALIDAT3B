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
