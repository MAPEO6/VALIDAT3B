import { test, after } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../server/app.ts";
import { loadConfig } from "../server/config.ts";
import { REASON_CODES } from "../server/reason-codes.ts";
import {
  ErrorSchema,
  RespuestaValidarSchema,
  ResultadoSchema,
} from "../server/schemas.ts";
import { resultadoMock, resultadoTecnico } from "../server/mock.ts";

const app = buildApp(loadConfig({ LOG_LEVEL: "silent", MAX_UPLOAD_MB: "1" } as NodeJS.ProcessEnv));
after(() => app.close());

const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 1, 2, 3]);

function formulario(opts: {
  meta?: string | null;
  campos?: string[];
  tamano?: number;
  tipo?: string;
}) {
  const fd = new FormData();
  if (opts.meta !== null) {
    fd.append("meta", opts.meta ?? JSON.stringify({ capture_id: "CAP-000123" }));
  }
  for (const c of opts.campos ?? ["fachada", "producto", "etiqueta"]) {
    const bytes = opts.tamano ? new Uint8Array(opts.tamano) : JPG;
    fd.append(c, new Blob([bytes], { type: opts.tipo ?? "image/jpeg" }), `${c}.jpg`);
  }
  return fd;
}

const post = (fd: FormData, query = "") =>
  app.inject({ method: "POST", url: `/api/validar${query}`, payload: fd });

test("GET /api/health responde ok", async () => {
  const r = await app.inject({ method: "GET", url: "/api/health" });
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().status, "ok");
});

test("GET /api/reason-codes devuelve la lista provisional", async () => {
  const r = await app.inject({ method: "GET", url: "/api/reason-codes" });
  assert.deepEqual(r.json().reason_codes, [...REASON_CODES]);
  assert.ok(REASON_CODES.includes("PRODUCTO_NO_COINCIDE"));
});

for (const decision of ["aprobada", "rechazada", "revision_manual"] as const) {
  test(`POST /api/validar?mock=${decision} cumple el contrato`, async () => {
    const r = await post(formulario({}), `?mock=${decision}`);
    assert.equal(r.statusCode, 200);
    const body = RespuestaValidarSchema.parse(r.json());
    assert.equal(body.resultado.decision, decision);
    assert.equal(body.resultado.capture_id, "CAP-000123");
    assert.equal(body.meta.fuente_decision, "mock");
  });
}

test("sin ?mock la decisión es determinista por capture_id", async () => {
  const a = (await post(formulario({}))).json().resultado.decision;
  const b = (await post(formulario({}))).json().resultado.decision;
  assert.equal(a, b);
});

test("rechazada incluye reason_code y el JSON no trae tipo_precio", async () => {
  const body = (await post(formulario({}), "?mock=rechazada")).json();
  assert.equal(body.resultado.reason_code, "PRODUCTO_NO_COINCIDE");
  assert.equal("tipo_precio" in body.resultado, false);
});

test("faltan imágenes → 400 IMAGENES_FALTANTES", async () => {
  const r = await post(formulario({ campos: ["fachada", "producto"] }));
  assert.equal(r.statusCode, 400);
  assert.equal(ErrorSchema.parse(r.json()).error.code, "IMAGENES_FALTANTES");
  assert.match(r.json().error.message, /etiqueta/);
});

test("meta ausente → 400 META_INVALIDA", async () => {
  const r = await post(formulario({ meta: null }));
  assert.equal(r.statusCode, 400);
  assert.equal(r.json().error.code, "META_INVALIDA");
});

test("meta no JSON → 400 META_INVALIDA", async () => {
  const r = await post(formulario({ meta: "{no es json" }));
  assert.equal(r.json().error.code, "META_INVALIDA");
});

test("meta sin capture_id → 400 META_INVALIDA", async () => {
  const r = await post(formulario({ meta: JSON.stringify({ codigo_barras: "123" }) }));
  assert.equal(r.json().error.code, "META_INVALIDA");
});

test("archivo que no es imagen → 400 SOLICITUD_INVALIDA", async () => {
  const r = await post(formulario({ tipo: "text/plain" }));
  assert.equal(r.statusCode, 400);
  assert.equal(r.json().error.code, "SOLICITUD_INVALIDA");
});

test("archivo mayor al límite → 413 ARCHIVO_DEMASIADO_GRANDE", async () => {
  const r = await post(formulario({ tamano: 2 * 1024 * 1024 })); // límite de prueba: 1 MB
  assert.equal(r.statusCode, 413);
  assert.equal(r.json().error.code, "ARCHIVO_DEMASIADO_GRANDE");
});

test("no multipart → 400 SOLICITUD_INVALIDA", async () => {
  const r = await app.inject({ method: "POST", url: "/api/validar", payload: { a: 1 } });
  assert.equal(r.statusCode, 400);
  assert.equal(r.json().error.code, "SOLICITUD_INVALIDA");
});

test("ruta inexistente → 404 NO_ENCONTRADO con formato de error", async () => {
  const r = await app.inject({ method: "GET", url: "/api/nada" });
  assert.equal(r.statusCode, 404);
  assert.equal(ErrorSchema.parse(r.json()).error.code, "NO_ENCONTRADO");
});

test("esquema: rechazada sin reason_code es inválida", () => {
  const malo = { ...resultadoMock("CAP-1", "rechazada"), reason_code: null };
  assert.equal(ResultadoSchema.safeParse(malo).success, false);
});

test("esquema: reason_code fuera de la lista es inválido", () => {
  const malo = { ...resultadoMock("CAP-1", "rechazada"), reason_code: "INVENTADO" };
  assert.equal(ResultadoSchema.safeParse(malo).success, false);
});

test("esquema: aprobada con una validación en falla es inválida", () => {
  const m = resultadoMock("CAP-1", "aprobada");
  const malo = { ...m, validaciones: { ...m.validaciones, producto: "falla" } };
  assert.equal(ResultadoSchema.safeParse(malo).success, false);
});

test("esquema: 'dudoso' no está permitido y confidence fuera de 0-1 falla", () => {
  const m = resultadoMock("CAP-1", "revision_manual");
  assert.equal(
    ResultadoSchema.safeParse({ ...m, validaciones: { ...m.validaciones, producto: "dudoso" } })
      .success,
    false,
  );
  assert.equal(ResultadoSchema.safeParse({ ...m, confidence_score: 1.2 }).success, false);
});

test("error técnico siempre es revision_manual y cumple el esquema", () => {
  const r = resultadoTecnico("CAP-9", "timeout");
  assert.equal(r.decision, "revision_manual");
  assert.equal(ResultadoSchema.safeParse(r).success, true);
});

test("config: valores por defecto y validación de PORT", () => {
  assert.equal(loadConfig({} as NodeJS.ProcessEnv).PORT, 3001);
  assert.throws(() => loadConfig({ PORT: "abc" } as NodeJS.ProcessEnv), /Configuración inválida/);
});
