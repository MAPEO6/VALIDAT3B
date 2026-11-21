// Motor de decisión (módulo 7). Función PURA de (evaluación del modelo, reglas, análisis local, parámetros):
// así se puede recalcular sobre un lote ya procesado, sin volver a llamar al modelo.
// Costos: acierto 0 · revisión 1 · rechazar válida 3 · aprobar inválida 10.
import { readFileSync } from "node:fs";
import { z } from "zod";
import type { AnalisisCaptura } from "./preprocesado.ts";
import type { RespuestaIA } from "./prompt.ts";
import type { ReasonCode } from "./reason-codes.ts";
import type { Senal } from "./reglas.ts";
import { ResultadoSchema, type Decision, type Resultado } from "./schemas.ts";

export const ParametrosSchema = z.object({
  umbralAprobar: z.number().min(0).max(1), // p mínima para aprobar
  umbralAprobarConCodigo: z.number().min(0).max(1), // p mínima si el código esperado se leyó localmente
  umbralRechazar: z.number().min(0).max(1), // p máxima para rechazar
  respetarRevisionModelo: z.boolean(), // si el modelo sugiere revisión, no aprobar ni rechazar
  respetarDecisionModelo: z.boolean(), // aprobar/rechazar solo si el modelo también lo sugiere
  precioBloqueaAprobacion: z.boolean(), // precio leído ≠ capturado impide aprobar
  inferirReasonCode: z.boolean(), // si el modelo no da reason_code, deducirlo de la validación que falla
});
export type ParametrosDecision = z.infer<typeof ParametrosSchema>;

export const PARAMETROS_DEFECTO: ParametrosDecision = {
  umbralAprobar: 0.95,
  umbralAprobarConCodigo: 0.9,
  umbralRechazar: 0.3,
  respetarRevisionModelo: true,
  respetarDecisionModelo: true,
  precioBloqueaAprobacion: true,
  inferirReasonCode: true,
};

export const RUTA_PARAMETROS = "config/decision.json";

// Lee config/decision.json (lo escribe `npm run calibrar -- --guardar`). Si no existe, usa los de defecto.
export function cargarParametros(ruta = RUTA_PARAMETROS): ParametrosDecision {
  try {
    return ParametrosSchema.parse({ ...PARAMETROS_DEFECTO, ...JSON.parse(readFileSync(ruta, "utf-8")) });
  } catch {
    return PARAMETROS_DEFECTO;
  }
}

const REASON_POR_VALIDACION: Record<string, ReasonCode> = {
  tienda_fachada: "FACHADA_INCORRECTA",
  producto: "PRODUCTO_NO_COINCIDE",
  evidencia_precio: "SIN_ETIQUETA_O_PRECIO",
  codigo_barras: "PRODUCTO_NO_COINCIDE",
};

export function confianza(decision: Decision, p: number): number {
  const c = decision === "aprobada" ? p : decision === "rechazada" ? 1 - p : 1 - Math.abs(2 * p - 1);
  return Math.round(c * 100) / 100;
}

export function decidir(
  captureId: string,
  ia: RespuestaIA,
  senales: Senal[],
  analisis: Pick<AnalisisCaptura, "codigo_barras"> | undefined,
  P: ParametrosDecision = PARAMETROS_DEFECTO,
): Resultado {
  const p = ia.probabilidad_valida;
  const fallas = Object.entries(ia.validaciones).filter(([, v]) => v === "falla").map(([k]) => k);
  const codigoLocal = analisis?.codigo_barras.coincide_esperado === true;
  const bloqueos = senales.filter(
    (s) => s.efecto === "revision" && (P.precioBloqueaAprobacion || s.regla !== "PRECIO_DETECTADO_IGUAL_CAPTURADO"),
  );
  const modeloRevision = P.respetarRevisionModelo && ia.decision === "revision_manual";

  let decision: Decision = "revision_manual";
  let reason: ReasonCode | null = null;
  const notas: string[] = [];

  const umbralA = codigoLocal ? P.umbralAprobarConCodigo : P.umbralAprobar;
  const puedeAprobar =
    !modeloRevision && fallas.length === 0 && p >= umbralA && bloqueos.length === 0 && (!P.respetarDecisionModelo || ia.decision === "aprobada");

  const reasonCandidato = ia.reason_code ?? (P.inferirReasonCode && fallas[0] ? REASON_POR_VALIDACION[fallas[0]]! : null);
  const puedeRechazar =
    !modeloRevision && fallas.length > 0 && reasonCandidato !== null && p <= P.umbralRechazar && (!P.respetarDecisionModelo || ia.decision === "rechazada");

  if (puedeAprobar) decision = "aprobada";
  else if (puedeRechazar) {
    decision = "rechazada";
    reason = reasonCandidato;
  } else {
    if (bloqueos.length && fallas.length === 0) notas.push(bloqueos.map((b) => b.detalle).join("; "));
    else if (ia.decision !== "revision_manual") notas.push("la evidencia no alcanza el umbral de confianza");
  }

  return ResultadoSchema.parse({
    capture_id: captureId,
    decision,
    confidence_score: confianza(decision, p),
    reason_code: reason,
    validaciones: ia.validaciones,
    precio_detectado: ia.precio_detectado,
    codigo_barras_detectado: ia.codigo_barras_detectado,
    explicacion: `${ia.explicacion}${notas.length ? ` (Enviada a revisión: ${notas.join("; ")}.)` : ""}`,
  });
}
