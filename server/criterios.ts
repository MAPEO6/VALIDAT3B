export const REASON_CODES: string[] = [
  // Pega aquí la lista oficial cuando la descargues con los datos
];

export const SYSTEM_PROMPT = `Eres un analista de validación de capturas de precio de campo para Tiendas 3B.
Recibes 3 fotos en este orden (fachada, producto, etiqueta de precio) y datos de la captura.
Aprobar una captura inválida es el error más caro: ante la duda NO apruebes.

A) IDENTIDAD DEL PRODUCTO (peso mayor, ~61% de rechazos)
- El producto debe ser visible y estar completo.
- Marca, descripción y contenido (g/ml/piezas) deben coincidir con el producto o contratipo esperado.
- El código de barras visible debe coincidir con el capturado y el esperado.
- Si es otro producto, o un contratipo no permitido, falla. Si la descripción es incompleta o no verificable, falla o dudoso.

B) CALIDAD DE LA EVIDENCIA (~29%)
- Fachada acorde a la cadena y tienda seleccionadas (letrero, logo, colores).
- Fotos nítidas y a distancia útil; no demasiado lejanas.
- Rechaza fotos tomadas a la pantalla de otro celular (moiré, bordes, reflejos).
- Si algo no se lee por borrosidad, no lo inventes.

C) EVIDENCIA DE PRECIO (~10%)
- Debe haber etiqueta legible asociada al producto fotografiado.
- Extrae el precio unitario exacto y su tipo: regular, oferta o volumen.
- No tomes un precio por kg/litro como precio unitario si no lo es.

DECISIÓN
- p = probabilidad (0-1) de que la captura sea válida.
- aprobada: las 4 validaciones en "ok" y p >= 0.95.
- rechazada: falla clara y evidente, p <= 0.30.
- revision_manual: cualquier caso intermedio o ambiguo.
- reason_code: SOLO de la lista oficial proporcionada.
- Si un precio o código no se lee, usa null. Nunca inventes.

Responde SOLO con JSON válido, sin texto extra ni markdown.`;

export const OUTPUT_SCHEMA = {
  capture_id: "string",
  decision: "aprobada | rechazada | revision_manual",
  confidence_score: "number 0-1 (probabilidad de que sea válida)",
  reason_code: "string de la lista oficial",
  validaciones: {
    tienda_fachada: "ok | falla | dudoso",
    producto: "ok | falla | dudoso",
    codigo_barras: "ok | falla | dudoso",
    evidencia_precio: "ok | falla | dudoso",
  },
  precio_detectado: "number | null",
  tipo_precio: "regular | oferta | volumen | null",
  codigo_barras_detectado: "string | null",
  explicacion: "una o dos frases",
};

export const buildUserText = (meta: Record<string, unknown>) =>
  `Datos de la captura: ${JSON.stringify(meta)}\n` +
  `Códigos válidos: ${JSON.stringify(REASON_CODES)}\n` +
  `Formato de salida: ${JSON.stringify(OUTPUT_SCHEMA)}`;

const UMBRAL_APROBACION = 0.95; // calíbralo con el set de validación

export function aplicarGuardas(r: any) {
  const v = Object.values(r.validaciones ?? {});
  if (
    r.decision === "aprobada" &&
    (v.some((x) => x !== "ok") || (r.confidence_score ?? 0) < UMBRAL_APROBACION)
  ) {
    r.decision = "revision_manual";
    r.explicacion = `${r.explicacion ?? ""} (Enviada a revisión: no cumple el umbral de aprobación.)`;
  }
  return r;
}
