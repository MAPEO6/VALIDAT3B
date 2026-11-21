// Flujo completo formulario → backend → lista del frontend, con Foundry simulado.
// Verifica que la cadena del formulario llegue al modelo y que cada decisión
// termine en la lista correcta (Productos validados, Rechazados o Revisión manual).
import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { buildApp } from "../server/app.ts";
import { loadConfig } from "../server/config.ts";
import { RespuestaValidarSchema } from "../server/schemas.ts";
import { resultadoACaptura } from "../src/mapping.ts";
import type { CapturaForm } from "../src/types.ts";

// JPEG real y pequeño (desde el módulo 5 las imágenes se decodifican con sharp).
const JPG = await sharp({ create: { width: 16, height: 16, channels: 3, background: "#808080" } }).jpeg().toBuffer();
const env = { LOG_LEVEL: "silent", FOUNDRY_API_KEY: "k", FOUNDRY_ENDPOINT: "https://e/anthropic", DATA_DIR: "no-existe" } as NodeJS.ProcessEnv;
const OK = { tienda_fachada: "ok", producto: "ok", codigo_barras: "ok", evidencia_precio: "ok" };

function modelo(respuesta: Record<string, unknown>) {
  const prompts: string[] = [];
  const f = (async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { messages: { content: { type: string; text?: string }[] }[] };
    prompts.push(body.messages[0]!.content.at(-1)!.text!);
    const texto = JSON.stringify({ precio_detectado: 12, codigo_barras_detectado: "7506233812418", explicacion: "ok", reason_code: null, ...respuesta });
    return new Response(JSON.stringify({ content: [{ type: "text", text: texto }], usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200 });
  }) as typeof fetch;
  return { f, prompts };
}

// Lo mismo que hace el frontend en useAppState: meta del formulario + 3 fotos.
async function enviar(form: CapturaForm, respuesta: Record<string, unknown>) {
  const m = modelo(respuesta);
  const app = buildApp(loadConfig(env), { fetchImpl: m.f });
  const fd = new FormData();
  fd.append("meta", JSON.stringify({
    capture_id: form.captureId,
    ...(form.tienda.trim() ? { tienda: form.tienda.trim() } : {}),
    ...(form.codigo ? { codigo_barras: form.codigo } : {}),
    ...(form.producto.trim() ? { producto_esperado: form.producto.trim() } : {}),
  }));
  for (const c of ["fachada", "producto", "etiqueta"]) fd.append(c, new Blob([JPG], { type: "image/jpeg" }), `${c}.jpg`);
  const r = await app.inject({ method: "POST", url: "/api/validar", payload: fd });
  await app.close();
  assert.equal(r.statusCode, 200);
  const captura = resultadoACaptura(RespuestaValidarSchema.parse(r.json()), form, [], "Hoy");
  return { captura, prompt: m.prompts[0] ?? "" };
}

const form: CapturaForm = { captureId: "CAP-270005", tienda: "Neto", codigo: "7506233812418", producto: "Detergente 900g" };

test("la cadena del formulario llega al modelo", async () => {
  const { prompt } = await enviar(form, { validaciones: OK, probabilidad_valida: 0.98, decision: "aprobada" });
  assert.match(prompt, /Cadena seleccionada: Neto/);
  const sin = await enviar({ ...form, tienda: "" }, { validaciones: OK, probabilidad_valida: 0.98, decision: "aprobada" });
  assert.match(sin.prompt, /Cadena seleccionada: no indicada/);
});

// Los umbrales salen del motor de decisión calibrado (config/decision.json, módulo 7-8).
test("aprobada → Productos validados", async () => {
  const { captura } = await enviar(form, { validaciones: OK, probabilidad_valida: 0.995, decision: "aprobada" });
  assert.equal(captura.status, "validada");
});

test("si el modelo sugiere revisión, el motor de decisión la respeta → Revisión manual", async () => {
  const { captura } = await enviar(form, { validaciones: OK, probabilidad_valida: 0.995, decision: "revision_manual" });
  assert.equal(captura.status, "revision");
});

test("rechazada con motivo → Rechazados", async () => {
  const { captura } = await enviar(form, {
    validaciones: { ...OK, tienda_fachada: "falla" }, probabilidad_valida: 0, decision: "rechazada", reason_code: "FACHADA_INCORRECTA",
  });
  assert.equal(captura.status, "rechazada");
  assert.equal(captura.motivo, "FACHADA_INCORRECTA");
});

test("caso dudoso → Revisión manual", async () => {
  const { captura } = await enviar(form, { validaciones: OK, probabilidad_valida: 0.8, decision: "revision_manual" });
  assert.equal(captura.status, "revision");
});
