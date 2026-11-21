// ⚠️ LISTA PROVISIONAL. No es la lista oficial del reto (no venía en los datos).
// Cuando el comité la entregue, este es el ÚNICO archivo que debe cambiar.
//
// Origen:
//  - PRODUCTO_NO_COINCIDE: aparece en el ejemplo oficial del brief.
//  - CAPTURA_LEJANA / CAPTURA_BORROSA / DESCRIPCION_INCOMPLETA: mapean a los
//    tres motivo_rechazo reales de capturas.csv.
//  - FACHADA_INCORRECTA / SIN_ETIQUETA_O_PRECIO: salen de nuestras reglas de negocio.
export const REASON_CODES = [
  "PRODUCTO_NO_COINCIDE",
  "DESCRIPCION_INCOMPLETA",
  "CAPTURA_LEJANA",
  "CAPTURA_BORROSA",
  "FACHADA_INCORRECTA",
  "SIN_ETIQUETA_O_PRECIO",
] as const;

export type ReasonCode = (typeof REASON_CODES)[number];

// Equivalencia con el texto de `motivo_rechazo` del dataset (útil para pruebas y scoring).
export const MOTIVO_DATASET_A_REASON_CODE: Record<string, ReasonCode> = {
  "Capturas lejanas": "CAPTURA_LEJANA",
  "Capturas borrosas": "CAPTURA_BORROSA",
  "Descripción de producto incompleta": "DESCRIPCION_INCOMPLETA",
};
