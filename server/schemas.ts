import { z } from "zod";
import { REASON_CODES } from "./reason-codes.ts";

export const DECISIONES = ["aprobada", "rechazada", "revision_manual"] as const;
export const ESTADO_VALIDACION = ["ok", "falla"] as const;

export const ValidacionesSchema = z.object({
  tienda_fachada: z.enum(ESTADO_VALIDACION),
  producto: z.enum(ESTADO_VALIDACION),
  codigo_barras: z.enum(ESTADO_VALIDACION),
  evidencia_precio: z.enum(ESTADO_VALIDACION),
});

// Contrato de salida por captura (el JSON oficial del reto).
export const ResultadoSchema = z
  .object({
    capture_id: z.string().min(1),
    decision: z.enum(DECISIONES),
    confidence_score: z.number().min(0).max(1),
    // null cuando no aplica (aprobada) o cuando es revisión manual sin causa única.
    reason_code: z.enum(REASON_CODES).nullable(),
    validaciones: ValidacionesSchema,
    precio_detectado: z.number().nonnegative().nullable(),
    codigo_barras_detectado: z.string().nullable(),
    explicacion: z.string().min(1),
  })
  .superRefine((r, ctx) => {
    if (r.decision === "rechazada" && r.reason_code === null) {
      ctx.addIssue({
        code: "custom",
        path: ["reason_code"],
        message: "Una captura rechazada debe incluir reason_code",
      });
    }
    if (
      r.decision === "aprobada" &&
      (r.reason_code !== null ||
        Object.values(r.validaciones).some((v) => v !== "ok"))
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["decision"],
        message:
          "Una captura aprobada requiere las 4 validaciones en ok y reason_code null",
      });
    }
  });

export type Resultado = z.infer<typeof ResultadoSchema>;
export type Decision = (typeof DECISIONES)[number];

export const UsageSchema = z.object({
  input_tokens: z.number().int().nonnegative(),
  output_tokens: z.number().int().nonnegative(),
});

// Respuesta de POST /api/validar (envoltorio que consume el frontend).
export const RespuestaValidarSchema = z.object({
  resultado: ResultadoSchema,
  usage: UsageSchema,
  meta: z.object({
    latencia_ms: z.number().nonnegative(),
    fuente_decision: z.enum(["mock", "regla", "ia", "error"]),
  }),
  // Solo con ?debug=1: texto crudo del modelo e intentos (para pruebas).
  debug: z
    .object({
      respuesta_modelo: z.string().nullable(),
      intentos_modelo: z.number(),
      analisis_imagenes: z.unknown().optional(), // AnalisisCaptura (server/preprocesado.ts)
    })
    .optional(),
});
export type RespuestaValidar = z.infer<typeof RespuestaValidarSchema>;

export const CODIGOS_ERROR = [
  "IMAGENES_FALTANTES",
  "META_INVALIDA",
  "SOLICITUD_INVALIDA",
  "ARCHIVO_DEMASIADO_GRANDE",
  "NO_ENCONTRADO",
  "DATASET_NO_DISPONIBLE",
  "ERROR_INTERNO",
] as const;
export type CodigoError = (typeof CODIGOS_ERROR)[number];

export const ErrorSchema = z.object({
  error: z.object({
    code: z.enum(CODIGOS_ERROR),
    message: z.string(),
  }),
});
export type ErrorRespuesta = z.infer<typeof ErrorSchema>;

// Campo `meta` (JSON) que acompaña a las 3 imágenes en POST /api/validar.
// Si capture_id existe en el dataset, se usan sus datos; si no, los campos opcionales de aquí.
export const MetaEntradaSchema = z.object({
  capture_id: z.string().min(1),
  codigo_barras: z.union([z.string(), z.number()]).optional(),
  producto_esperado: z.string().optional(),
  tienda: z.string().optional(),
  marca: z.string().optional(),
  contenido: z.string().optional(),
});
export type MetaEntrada = z.infer<typeof MetaEntradaSchema>;
