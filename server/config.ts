import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(25),
  // Foundry es opcional en el módulo 1; se exigirá a partir del módulo 4.
  FOUNDRY_API_KEY: z.string().optional(),
  FOUNDRY_ENDPOINT: z.string().optional(),
  FOUNDRY_MODEL: z.string().default("claude-haiku-5-5"),
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
