import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import sharp from "sharp";
import { buildApp } from "../server/app.ts";
import { loadConfig, opcionesFoundry } from "../server/config.ts";
import { llamarModelo, urlMensajes, type OpcionesFoundry } from "../server/foundry.ts";
import { aResultado, confianzaDe, detectarMediaType, validarCaptura, type EntradaPipeline } from "../server/pipeline.ts";
import { RespuestaIASchema, SYSTEM_PROMPT, extraerJson, textoUsuario } from "../server/prompt.ts";
import { REASON_CODES } from "../server/reason-codes.ts";
import { RespuestaValidarSchema, ResultadoSchema } from "../server/schemas.ts";

// ---------- Foundry simulado ----------
type Paso = { status?: number; texto?: string; usage?: { input_tokens: number; output_tokens: number }; lanzar?: Error };
function fakeFetch(pasos: Paso[]) {
  const llamadas: { url: string; body: Record<string, unknown>; headers: Record<string, string> }[] = [];
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    llamadas.push({ url: String(url), body: JSON.parse(String(init?.body)), headers: init?.headers as Record<string, string> });
    const p = pasos[Math.min(llamadas.length - 1, pasos.length - 1)]!;
    if (p.lanzar) throw p.lanzar;
    const status = p.status ?? 200;
    const cuerpo = status === 200
      ? { content: [{ type: "text", text: p.texto ?? "" }], usage: p.usage ?? { input_tokens: 1500, output_tokens: 120 }, stop_reason: "end_turn" }
      : { error: { message: `fallo ${status}` } };
    return new Response(JSON.stringify(cuerpo), { status });
  }) as typeof fetch;
  return { f, llamadas };
}

const ia = (extra: Record<string, unknown> = {}) => ({
  validaciones: { tienda_fachada: "ok", producto: "ok", codigo_barras: "ok", evidencia_precio: "ok" },
  probabilidad_valida: 0.98,
  decision: "aprobada",
  reason_code: null,
  precio_detectado: 30,
  codigo_barras_detectado: "7501372812565",
  explicacion: "Todo coincide.",
  ...extra,
});
const falla = (campo: string) => ({ ...ia().validaciones, [campo]: "falla" });

// JPEG real y pequeño (desde el módulo 5 las imágenes se decodifican con sharp).
const JPG = await sharp({ create: { width: 16, height: 16, channels: 3, background: "#808080" } }).jpeg().toBuffer();
const entrada: EntradaPipeline = {
  contexto: { capture_id: "CAP-T1", tienda: "Walmart", producto: "Arroz 1000g", marca: "SOS", contenido: "1000 gramo", codigo_barras_esperado: "7501372812565" },
  imagenes: { facade: JPG, product: JPG, shelf: JPG },
};
const foundry = (f: typeof fetch, extra: Partial<OpcionesFoundry> = {}): OpcionesFoundry => ({
  apiKey: "k", endpoint: "https://x.services.ai.azure.com/anthropic/", model: "claude-haiku-5-5", esperaBaseMs: 1, fetchImpl: f, ...extra,
});

// ---------- prompt ----------
test("prompt: sin tipo_precio, con todos los reason_code y sin precio capturado", () => {
  assert.equal(/tipo_precio/.test(SYSTEM_PROMPT), false);
  for (const c of REASON_CODES) assert.ok(SYSTEM_PROMPT.includes(c), c);
  assert.equal(/dudoso/.test(SYSTEM_PROMPT), false);
  const t = textoUsuario(entrada.contexto);
  assert.match(t, /Walmart/);
  assert.match(t, /7501372812565/);
  assert.equal(/precio/i.test(t), false);
});

test("extraerJson: tolera ```json, texto alrededor; falla sin objeto", () => {
  assert.deepEqual(extraerJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extraerJson('Aquí está: {"a":{"b":2}} listo'), { a: { b: 2 } });
  assert.throws(() => extraerJson("no hay json"), /no contiene/);
});

test("RespuestaIASchema: normaliza mayúsculas, '$42.50', código numérico y 'null'", () => {
  const r = RespuestaIASchema.parse(ia({
    validaciones: { tienda_fachada: "OK", producto: "Falla", codigo_barras: "ok", evidencia_precio: "ok" },
    decision: "Rechazada", reason_code: "producto_no_coincide",
    precio_detectado: "$42.50", codigo_barras_detectado: 7501372812565,
  }));
  assert.equal(r.validaciones.producto, "falla");
  assert.equal(r.decision, "rechazada");
  assert.equal(r.reason_code, "PRODUCTO_NO_COINCIDE");
  assert.equal(r.precio_detectado, 42.5);
  assert.equal(r.codigo_barras_detectado, "7501372812565");
  assert.equal(RespuestaIASchema.parse(ia({ precio_detectado: "null", codigo_barras_detectado: "" })).precio_detectado, null);
  assert.equal(RespuestaIASchema.safeParse(ia({ reason_code: "INVENTADO" })).success, false);
  assert.equal(RespuestaIASchema.safeParse(ia({ validaciones: falla("producto"), probabilidad_valida: 1.5 })).success, false);
});

// ---------- guardas provisionales ----------
test("guarda: aprobada con una validación en falla → revision_manual", () => {
  const r = aResultado("C", RespuestaIASchema.parse(ia({ validaciones: falla("evidencia_precio") })));
  assert.equal(r.decision, "revision_manual");
  assert.match(r.explicacion, /revisión/);
});

test("guarda: aprobada con probabilidad < 0.95 → revision_manual", () => {
  assert.equal(aResultado("C", RespuestaIASchema.parse(ia({ probabilidad_valida: 0.9 }))).decision, "revision_manual");
  assert.equal(aResultado("C", RespuestaIASchema.parse(ia({ probabilidad_valida: 0.95 }))).decision, "aprobada");
});

test("guarda: rechazada sin reason_code o sin falla → revision_manual; con ambos → rechazada", () => {
  const sinCodigo = RespuestaIASchema.parse(ia({ decision: "rechazada", validaciones: falla("producto"), probabilidad_valida: 0.1 }));
  assert.equal(aResultado("C", sinCodigo).decision, "revision_manual");
  const sinFalla = RespuestaIASchema.parse(ia({ decision: "rechazada", reason_code: "CAPTURA_LEJANA", probabilidad_valida: 0.1 }));
  assert.equal(aResultado("C", sinFalla).decision, "revision_manual");
  const ok = aResultado("C", RespuestaIASchema.parse(ia({ decision: "rechazada", reason_code: "CAPTURA_LEJANA", validaciones: falla("producto"), probabilidad_valida: 0.1 })));
  assert.equal(ok.decision, "rechazada");
  assert.equal(ok.reason_code, "CAPTURA_LEJANA");
  assert.equal(ok.confidence_score, 0.9);
});

test("confianza en la decisión emitida", () => {
  assert.equal(confianzaDe("aprobada", 0.97), 0.97);
  assert.equal(confianzaDe("rechazada", 0.07), 0.93);
  assert.equal(confianzaDe("revision_manual", 0.5), 1);
  assert.equal(confianzaDe("revision_manual", 0.9), 0.2);
});

test("reason_code se descarta si la decisión no es rechazada", () => {
  const r = aResultado("C", RespuestaIASchema.parse(ia({ decision: "revision_manual", reason_code: "CAPTURA_BORROSA", probabilidad_valida: 0.5, validaciones: falla("producto") })));
  assert.equal(r.reason_code, null);
  assert.equal(ResultadoSchema.safeParse(r).success, true);
});

// ---------- cliente Foundry ----------
test("foundry: URL, cabeceras, modelo, temperatura 0 y 3 imágenes en orden", async () => {
  const { f, llamadas } = fakeFetch([{ texto: JSON.stringify(ia()) }]);
  const s = await validarCaptura(entrada, { foundry: foundry(f) });
  assert.equal(llamadas.length, 1);
  const l = llamadas[0]!;
  assert.equal(l.url, "https://x.services.ai.azure.com/anthropic/v1/messages");
  assert.equal(l.headers["x-api-key"], "k");
  assert.equal(l.headers["api-key"], "k");
  assert.equal(l.body.model, "claude-haiku-5-5");
  assert.equal("temperature" in l.body, false); // el modelo en Foundry no acepta temperature
  const content = (l.body.messages as { content: { type: string; text?: string }[] }[])[0]!.content;
  assert.deepEqual(content.map((b) => b.type), ["text", "image", "text", "image", "text", "image", "text"]);
  assert.deepEqual(content.filter((b) => b.type === "text").slice(0, 3).map((b) => b.text), ["Imagen 1: FACHADA", "Imagen 2: PRODUCTO", "Imagen 3: ETIQUETA DE PRECIO"]);
  assert.equal(s.fuente_decision, "ia");
  assert.equal(s.resultado.decision, "aprobada");
  assert.deepEqual(s.usage, { input_tokens: 1500, output_tokens: 120 });
});

test("urlMensajes no duplica /v1/messages", () => {
  assert.equal(urlMensajes("https://a/anthropic/v1/messages"), "https://a/anthropic/v1/messages");
  assert.equal(urlMensajes(" https://a/anthropic// "), "https://a/anthropic/v1/messages");
});

test("foundry: 429 y 503 se reintentan; 401 no", async () => {
  const t = fakeFetch([{ status: 429 }, { status: 503 }, { texto: "{}" }]);
  const r = await llamarModelo(foundry(t.f), { system: "s", content: [], maxTokens: 5 });
  assert.equal(r.intentos, 3);
  const u = fakeFetch([{ status: 401 }]);
  await assert.rejects(llamarModelo(foundry(u.f), { system: "s", content: [], maxTokens: 5 }), /401/);
  assert.equal(u.llamadas.length, 1);
});

test("foundry: error de red agota reintentos y termina en revision_manual", async () => {
  const t = fakeFetch([{ lanzar: new TypeError("fetch failed") }]);
  const s = await validarCaptura(entrada, { foundry: foundry(t.f, { reintentos: 2 }) });
  assert.equal(t.llamadas.length, 3);
  assert.equal(s.fuente_decision, "error");
  assert.equal(s.resultado.decision, "revision_manual");
  assert.match(s.resultado.explicacion, /fetch failed/);
});

test("foundry: timeout → revision_manual", async () => {
  // Simula un servidor que no responde. El setTimeout mantiene vivo el proceso como lo haría un socket real.
  const lento = (async (_u: unknown, init?: RequestInit) =>
    new Promise((_, rej) => {
      const t = setTimeout(() => rej(new Error("no debió llegar aquí")), 5000);
      init?.signal?.addEventListener("abort", () => {
        clearTimeout(t);
        rej(init.signal!.reason);
      });
    })) as typeof fetch;
  const s = await validarCaptura(entrada, { foundry: foundry(lento, { timeoutMs: 20, reintentos: 0 }) });
  assert.equal(s.resultado.decision, "revision_manual");
  assert.match(s.resultado.explicacion, /tiempo de espera/);
});

// ---------- pipeline ----------
test("pipeline: respuesta no-JSON se reintenta una vez y suma tokens", async () => {
  const t = fakeFetch([{ texto: "Lo siento, no puedo." }, { texto: "```json\n" + JSON.stringify(ia()) + "\n```" }]);
  const s = await validarCaptura(entrada, { foundry: foundry(t.f) });
  assert.equal(t.llamadas.length, 2);
  assert.equal(s.resultado.decision, "aprobada");
  assert.deepEqual(s.usage, { input_tokens: 3000, output_tokens: 240 });
});

test("pipeline: dos respuestas inválidas → revision_manual con tokens contados", async () => {
  const t = fakeFetch([{ texto: JSON.stringify(ia({ decision: "tal_vez" })) }]);
  const s = await validarCaptura(entrada, { foundry: foundry(t.f) });
  assert.equal(s.fuente_decision, "error");
  assert.equal(s.resultado.decision, "revision_manual");
  assert.equal(s.usage.input_tokens, 3000);
  assert.match(s.resultado.explicacion, /respuesta del modelo inválida/);
});

test("pipeline: sin Foundry configurado → revision_manual sin llamar a nada", async () => {
  const s = await validarCaptura(entrada, { foundry: null });
  assert.equal(s.resultado.decision, "revision_manual");
  assert.match(s.resultado.explicacion, /no configurado/);
  assert.equal(ResultadoSchema.safeParse(s.resultado).success, true);
});

test("pipeline: archivo que no es imagen → revision_manual sin llamar al modelo (M4)", async () => {
  const t = fakeFetch([{ texto: JSON.stringify(ia()) }]);
  const s = await validarCaptura({ ...entrada, imagenes: { ...entrada.imagenes, shelf: Buffer.from("hola") } }, { foundry: foundry(t.f) });
  assert.equal(t.llamadas.length, 0);
  assert.equal(s.resultado.decision, "revision_manual");
});

test("detectarMediaType por bytes", () => {
  assert.equal(detectarMediaType(JPG), "image/jpeg");
  assert.equal(detectarMediaType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
  assert.equal(detectarMediaType(Buffer.from("RIFF0000WEBP")), "image/webp");
  assert.equal(detectarMediaType(Buffer.from("texto")), null);
});

test("config: opcionesFoundry null si falta llave o endpoint", () => {
  assert.equal(opcionesFoundry(loadConfig({} as NodeJS.ProcessEnv)), null);
  assert.equal(opcionesFoundry(loadConfig({ FOUNDRY_API_KEY: "k", FOUNDRY_ENDPOINT: "  " } as NodeJS.ProcessEnv)), null);
  assert.ok(opcionesFoundry(loadConfig({ FOUNDRY_API_KEY: "k", FOUNDRY_ENDPOINT: "https://e" } as NodeJS.ProcessEnv)));
});

// ---------- endpoints (con Foundry simulado) ----------
const env = { LOG_LEVEL: "silent", FOUNDRY_API_KEY: "k", FOUNDRY_ENDPOINT: "https://e/anthropic", DATA_DIR: "data" } as NodeJS.ProcessEnv;

test("POST /api/validar (subida) usa el modelo y respeta el contrato; ?debug=1 trae la respuesta cruda", async () => {
  const t = fakeFetch([{ texto: JSON.stringify(ia()) }]);
  const app = buildApp(loadConfig(env), { fetchImpl: t.f });
  const fd = new FormData();
  fd.append("meta", JSON.stringify({ capture_id: "CAP-SUBIDA", producto_esperado: "Arroz", tienda: "Walmart" }));
  for (const c of ["fachada", "producto", "etiqueta"]) fd.append(c, new Blob([JPG], { type: "image/jpeg" }), `${c}.jpg`);
  const r = await app.inject({ method: "POST", url: "/api/validar?debug=1", payload: fd });
  assert.equal(r.statusCode, 200);
  const b = RespuestaValidarSchema.parse(r.json());
  assert.equal(b.meta.fuente_decision, "ia");
  assert.equal(b.resultado.capture_id, "CAP-SUBIDA");
  assert.ok(b.debug?.respuesta_modelo?.includes("validaciones"));
  const texto = (t.llamadas[0]!.body.messages as { content: { type: string; text?: string }[] }[])[0]!.content.at(-1)!.text!;
  assert.match(texto, /Walmart/);
  assert.equal((await app.inject({ method: "GET", url: "/api/health" })).json().modo, "ia");
  await app.close();
});

test("POST /api/validar?mock=... sigue sin llamar al modelo", async () => {
  const t = fakeFetch([{ texto: JSON.stringify(ia()) }]);
  const app = buildApp(loadConfig(env), { fetchImpl: t.f });
  const fd = new FormData();
  fd.append("meta", JSON.stringify({ capture_id: "CAP-1" }));
  for (const c of ["fachada", "producto", "etiqueta"]) fd.append(c, new Blob([JPG], { type: "image/jpeg" }), `${c}.jpg`);
  const r = await app.inject({ method: "POST", url: "/api/validar?mock=rechazada", payload: fd });
  assert.equal(r.json().meta.fuente_decision, "mock");
  assert.equal(t.llamadas.length, 0);
  await app.close();
});

const hayDatos = existsSync("data/capturas.json");
test("POST /api/capturas/:id/validar con imágenes reales y datos del dataset", { skip: !hayDatos }, async () => {
  const t = fakeFetch([{ texto: JSON.stringify(ia({ decision: "rechazada", reason_code: "CAPTURA_LEJANA", validaciones: falla("producto"), probabilidad_valida: 0.05 })) }]);
  const app = buildApp(loadConfig(env), { fetchImpl: t.f });
  const r = await app.inject({ method: "POST", url: "/api/capturas/CAP-111555/validar" });
  assert.equal(r.statusCode, 200);
  const b = RespuestaValidarSchema.parse(r.json());
  assert.equal(b.resultado.decision, "rechazada");
  assert.equal(b.resultado.capture_id, "CAP-111555");
  const content = (t.llamadas[0]!.body.messages as { content: { type: string; text?: string; source?: { media_type: string } }[] }[])[0]!.content;
  assert.equal(content.filter((x) => x.type === "image").length, 3);
  assert.match(content.at(-1)!.text!, /Pan para hamburguesa/);
  assert.match(content.at(-1)!.text!, /Bodega Aurrera/);
  const nf = await app.inject({ method: "POST", url: "/api/capturas/CAP-NO/validar" });
  assert.equal(nf.statusCode, 404);
  await app.close();
});

test("POST /api/capturas/:id/validar sin Foundry → 200 revision_manual (error técnico)", { skip: !hayDatos }, async () => {
  const app = buildApp(loadConfig({ LOG_LEVEL: "silent", DATA_DIR: "data" } as NodeJS.ProcessEnv));
  const b = (await app.inject({ method: "POST", url: "/api/capturas/CAP-111555/validar" })).json();
  assert.equal(b.resultado.decision, "revision_manual");
  assert.equal(b.meta.fuente_decision, "error");
  assert.equal((await app.inject({ method: "GET", url: "/api/health" })).json().modo, "sin_foundry");
  await app.close();
});
