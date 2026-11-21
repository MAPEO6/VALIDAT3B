import type { Captura } from "../server/dataset.ts";
import type { Decision, Resultado } from "../server/schemas.ts";

export function resultadoBase(c: Captura, decision: Decision): Resultado {
  const ok = { tienda_fachada: "ok", producto: "ok", codigo_barras: "ok", evidencia_precio: "ok" } as const;
  if (decision === "aprobada") {
    return {
      capture_id: c.capture_id, decision, confidence_score: 1, reason_code: null, validaciones: ok,
      precio_detectado: c.capture_price, codigo_barras_detectado: c.product_barcode,
      explicacion: "[BASELINE] aprobada",
    };
  }
  if (decision === "rechazada") {
    return {
      capture_id: c.capture_id, decision, confidence_score: 1,
      reason_code: c.reason_code_esperado ?? "PRODUCTO_NO_COINCIDE",
      validaciones: { ...ok, producto: "falla" },
      precio_detectado: null, codigo_barras_detectado: null,
      explicacion: "[BASELINE] rechazada",
    };
  }
  return {
    capture_id: c.capture_id, decision, confidence_score: 0.5, reason_code: null,
    validaciones: { ...ok, evidencia_precio: "falla" },
    precio_detectado: null, codigo_barras_detectado: null,
    explicacion: "[BASELINE] revisión manual",
  };
}
