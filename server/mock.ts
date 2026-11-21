import type { Decision, Resultado } from "./schemas.ts";

// Respuestas de ejemplo para que el frontend y las pruebas trabajen contra el contrato real.
// Se reemplazan por el pipeline real en módulos posteriores.
export function resultadoMock(captureId: string, decision: Decision): Resultado {
  switch (decision) {
    case "aprobada":
      return {
        capture_id: captureId,
        decision,
        confidence_score: 0.97,
        reason_code: null,
        validaciones: {
          tienda_fachada: "ok",
          producto: "ok",
          codigo_barras: "ok",
          evidencia_precio: "ok",
        },
        precio_detectado: 42.5,
        codigo_barras_detectado: "7501234567890",
        explicacion: "[MOCK] Fachada, producto, código de barras y etiqueta coinciden.",
      };
    case "rechazada":
      return {
        capture_id: captureId,
        decision,
        confidence_score: 0.93,
        reason_code: "PRODUCTO_NO_COINCIDE",
        validaciones: {
          tienda_fachada: "ok",
          producto: "falla",
          codigo_barras: "ok",
          evidencia_precio: "ok",
        },
        precio_detectado: 42.5,
        codigo_barras_detectado: "7501234567890",
        explicacion:
          "[MOCK] El producto de la foto es de otra marca que la del contratipo esperado.",
      };
    case "revision_manual":
      return {
        capture_id: captureId,
        decision,
        confidence_score: 0.62,
        reason_code: null,
        validaciones: {
          tienda_fachada: "ok",
          producto: "ok",
          codigo_barras: "ok",
          evidencia_precio: "falla",
        },
        precio_detectado: null,
        codigo_barras_detectado: "7501234567890",
        explicacion:
          "[MOCK] La etiqueta tiene dos precios y no es posible determinar el unitario.",
      };
  }
}

// Fallo técnico (red, JSON inválido, etc.): siempre revision_manual (costo 1, nunca 10).
// Las validaciones quedan en "falla" porque nada pudo verificarse; el frontend distingue
// este caso por meta.fuente_decision === "error".
export function resultadoTecnico(captureId: string, motivo: string): Resultado {
  return {
    capture_id: captureId,
    decision: "revision_manual",
    confidence_score: 0,
    reason_code: null,
    validaciones: {
      tienda_fachada: "falla",
      producto: "falla",
      codigo_barras: "falla",
      evidencia_precio: "falla",
    },
    precio_detectado: null,
    codigo_barras_detectado: null,
    explicacion: `Error técnico de procesamiento: ${motivo}`,
  };
}
