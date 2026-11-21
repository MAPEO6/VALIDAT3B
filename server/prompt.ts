// Prompt y esquema de la respuesta del modelo. El modelo NO produce el JSON oficial directamente:
// produce una evaluación (RespuestaIA) y el código arma el JSON oficial (pipeline.ts).
import { z } from "zod";
import { REASON_CODES } from "./reason-codes.ts";
import { DECISIONES, ESTADO_VALIDACION } from "./schemas.ts";

export const SYSTEM_PROMPT = `Eres auditor de capturas de precio en campo para Tiendas 3B.
Cada captura trae 3 fotos en este orden: (1) FACHADA de la tienda, (2) PRODUCTO, (3) ETIQUETA de precio en anaquel, y los datos del producto esperado.
Aprobar una captura inválida es el error más caro. Ante cualquier duda real, NO apruebes.

Evalúa 4 validaciones, cada una "ok" o "falla":

tienda_fachada
- ok: la fachada muestra el logo o el nombre de la cadena indicada.
- falla: no se ve logo ni nombre de la cadena, es otra cadena, o la foto no es una fachada.

producto
- ok: el producto está visible y completo, y marca, descripción y contenido (g, ml, piezas) coinciden con el esperado.
- falla: es otro producto, otra marca u otro contenido; no se ve el producto; o la descripción del empaque no se alcanza a verificar (descripción incompleta).

codigo_barras
- ok: el producto fotografiado corresponde al código de barras esperado (mismo producto y presentación). Si lees dígitos del código, deben coincidir.
- falla: los dígitos visibles no coinciden, o el producto fotografiado claramente no corresponde a ese código.

evidencia_precio
- ok: hay una etiqueta de anaquel legible, asociada a este producto, con el precio unitario.
- falla: no hay etiqueta, no se lee el precio, o la etiqueta es de otro producto.

Calidad de la evidencia (afecta a la validación correspondiente):
- Foto lejana: el producto o la etiqueta salen tan pequeños que no se distinguen sus detalles.
- Foto borrosa: desenfocada o movida, no se leen textos.
- Foto tomada a la pantalla de otro celular (moiré, píxeles, bordes de pantalla, reflejos): es evidencia inválida.

Decisión:
- probabilidad_valida: tu probabilidad (0 a 1) de que la captura completa sea válida.
- "aprobada": solo si las 4 validaciones son "ok" y estás muy seguro (probabilidad_valida ≥ 0.95).
- "rechazada": solo si hay una falla clara y evidente; indica el reason_code principal.
- "revision_manual": cualquier caso intermedio, ambiguo o que no puedas verificar.

reason_code (usa solo uno de esta lista, o null si no es rechazada):
- FACHADA_INCORRECTA: la fachada no muestra logo ni nombre de la cadena, o es otra cadena.
- CAPTURA_LEJANA: el producto o la etiqueta se tomaron demasiado lejos.
- CAPTURA_BORROSA: fotos borrosas, movidas, o tomadas a la pantalla de otro celular.
- PRODUCTO_NO_COINCIDE: otro producto, marca o contenido, contratipo no válido, o producto no visible.
- DESCRIPCION_INCOMPLETA: el producto se ve, pero no se alcanza a verificar su descripción completa.
- SIN_ETIQUETA_O_PRECIO: no hay etiqueta o no tiene precio legible.

Extracción:
- precio_detectado: el precio unitario que lees en la etiqueta (número, sin "$"). Si hay varios, el precio regular de una pieza. null si no se lee.
- codigo_barras_detectado: solo los dígitos que realmente lees en las fotos. null si no se leen. Nunca copies el código esperado sin leerlo.
- No inventes nada que no se vea.

Responde SOLO con un objeto JSON, sin markdown ni texto adicional, con estas claves exactas:
{"validaciones":{"tienda_fachada":"ok|falla","producto":"ok|falla","codigo_barras":"ok|falla","evidencia_precio":"ok|falla"},"probabilidad_valida":0.0,"decision":"aprobada|rechazada|revision_manual","reason_code":"CODIGO|null","precio_detectado":0.0,"codigo_barras_detectado":"string|null","explicacion":"una o dos frases en español"}`;

export interface ContextoCaptura {
  capture_id: string;
  tienda?: string;
  producto?: string;
  marca?: string;
  contenido?: string; // ej. "1000 gramo"
  codigo_barras_esperado?: string;
}

// Solo datos del producto esperado. El precio capturado NO se envía para no sesgar la lectura;
// se compara en código (módulo 6).
export function textoUsuario(ctx: ContextoCaptura): string {
  const lineas = [
    `Cadena seleccionada: ${ctx.tienda ?? "no indicada"}`,
    `Producto esperado: ${ctx.producto ?? "no indicado"}`,
    `Marca: ${ctx.marca ?? "no indicada"}`,
    `Contenido: ${ctx.contenido ?? "no indicado"}`,
    `Código de barras esperado: ${ctx.codigo_barras_esperado ?? "no indicado"}`,
  ];
  return `Datos de la captura:\n${lineas.join("\n")}\nResponde solo con el JSON.`;
}

// ---------- Respuesta del modelo (tolerante a formatos comunes) ----------
const minusculas = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : v);
const nullish = (v: unknown) => (v === undefined || v === "" || v === "null" ? null : v);

const precio = z.preprocess((v) => {
  v = nullish(v);
  if (typeof v === "string") {
    const n = Number(v.replace(/[$\s,]/g, ""));
    return Number.isFinite(n) ? n : v;
  }
  return v;
}, z.number().nonnegative().nullable());

const codigoBarras = z.preprocess((v) => {
  v = nullish(v);
  if (typeof v === "number") return String(v);
  if (typeof v === "string") {
    const d = v.replace(/\D/g, "");
    return d === "" ? null : d;
  }
  return v;
}, z.string().nullable());

const estado = z.preprocess(minusculas, z.enum(ESTADO_VALIDACION));

export const RespuestaIASchema = z.object({
  validaciones: z.object({
    tienda_fachada: estado,
    producto: estado,
    codigo_barras: estado,
    evidencia_precio: estado,
  }),
  probabilidad_valida: z.coerce.number().min(0).max(1),
  decision: z.preprocess(minusculas, z.enum(DECISIONES)),
  reason_code: z.preprocess((v) => {
    v = nullish(v);
    return typeof v === "string" ? v.trim().toUpperCase() : v;
  }, z.enum(REASON_CODES).nullable()),
  precio_detectado: precio,
  codigo_barras_detectado: codigoBarras,
  explicacion: z.string().trim().min(1),
});
export type RespuestaIA = z.infer<typeof RespuestaIASchema>;

// Extrae el primer objeto JSON del texto (tolera ```json ... ``` y texto alrededor).
export function extraerJson(texto: string): unknown {
  const sinFences = texto.replace(/```(?:json)?/gi, "").trim();
  const ini = sinFences.indexOf("{");
  const fin = sinFences.lastIndexOf("}");
  if (ini === -1 || fin <= ini) throw new Error("la respuesta del modelo no contiene un objeto JSON");
  return JSON.parse(sinFences.slice(ini, fin + 1));
}
