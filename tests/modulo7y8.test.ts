import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { cargarParametros, decidir, PARAMETROS_DEFECTO, type ParametrosDecision } from "../server/decision.ts";
import { asegurarFinDeLinea, exportarFinal, leerRegistros } from "../server/lote.ts";
import { RespuestaIASchema } from "../server/prompt.ts";
import type { Senal } from "../server/reglas.ts";
import { ResultadoSchema } from "../server/schemas.ts";
import type { Captura } from "../server/dataset.ts";

const ok = { tienda_fachada: "ok", producto: "ok", codigo_barras: "ok", evidencia_precio: "ok" };
const ia = (extra: Record<string, unknown> = {}) =>
  RespuestaIASchema.parse({ validaciones: ok, probabilidad_valida: 0.97, decision: "aprobada", reason_code: null, precio_detectado: 30, codigo_barras_detectado: null, explicacion: "e", ...extra });
const conCodigo = { codigo_barras: { leidos: ["1"], coincide_esperado: true, leido_en: "shelf" as const } };
const sinCodigo = { codigo_barras: { leidos: [], coincide_esperado: false, leido_en: null } };
const precioDistinto: Senal = { regla: "PRECIO_DETECTADO_IGUAL_CAPTURADO", efecto: "revision", validacion: "evidencia_precio", detalle: "$32 ≠ $30" };
const P = (x: Partial<ParametrosDecision> = {}) => ({ ...PARAMETROS_DEFECTO, ...x });

test("decidir: aprueba con todo ok y p ≥ umbral; con código local basta un umbral menor", () => {
  assert.equal(decidir("C", ia(), [], sinCodigo).decision, "aprobada");
  assert.equal(decidir("C", ia({ probabilidad_valida: 0.92 }), [], sinCodigo).decision, "revision_manual");
  assert.equal(decidir("C", ia({ probabilidad_valida: 0.92 }), [], conCodigo).decision, "aprobada");
});

test("decidir: nunca aprueba con una falla o con una regla en revisión", () => {
  const f = ia({ validaciones: { ...ok, evidencia_precio: "falla" } });
  assert.notEqual(decidir("C", f, [], conCodigo).decision, "aprobada");
  assert.equal(decidir("C", ia(), [precioDistinto], conCodigo).decision, "revision_manual");
  assert.equal(decidir("C", ia(), [precioDistinto], conCodigo, P({ precioBloqueaAprobacion: false })).decision, "aprobada");
});

test("decidir: rechaza con falla + p ≤ umbral; infiere reason_code si falta", () => {
  const r = decidir("C", ia({ decision: "rechazada", probabilidad_valida: 0.1, validaciones: { ...ok, tienda_fachada: "falla" } }), [], sinCodigo);
  assert.equal(r.decision, "rechazada");
  assert.equal(r.reason_code, "FACHADA_INCORRECTA");
  assert.equal(r.confidence_score, 0.9);
  const alta = decidir("C", ia({ decision: "rechazada", probabilidad_valida: 0.45, reason_code: "CAPTURA_LEJANA", validaciones: { ...ok, producto: "falla" } }), [], sinCodigo);
  assert.equal(alta.decision, "revision_manual");
});

test("decidir: respeta la revisión sugerida por el modelo (configurable)", () => {
  const m = ia({ decision: "revision_manual", probabilidad_valida: 0.99 });
  assert.equal(decidir("C", m, [], conCodigo).decision, "revision_manual");
  assert.equal(decidir("C", m, [], conCodigo, P({ respetarRevisionModelo: false, respetarDecisionModelo: false })).decision, "aprobada");
});

test("decidir: siempre produce JSON oficial válido", () => {
  for (const pv of [0, 0.1, 0.3, 0.5, 0.9, 1]) for (const d of ["aprobada", "rechazada", "revision_manual"])
    assert.equal(ResultadoSchema.safeParse(decidir("C", ia({ probabilidad_valida: pv, decision: d, validaciones: { ...ok, producto: pv < 0.5 ? "falla" : "ok" } }), [], sinCodigo)).success, true);
});

test("cargarParametros: sin archivo → defecto; archivo parcial se completa", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "v3b-"));
  assert.deepEqual(cargarParametros(path.join(dir, "no.json")), PARAMETROS_DEFECTO);
  await writeFile(path.join(dir, "d.json"), JSON.stringify({ umbralAprobar: 0.9 }));
  assert.equal(cargarParametros(path.join(dir, "d.json")).umbralAprobar, 0.9);
  await writeFile(path.join(dir, "malo.json"), "{roto");
  assert.deepEqual(cargarParametros(path.join(dir, "malo.json")), PARAMETROS_DEFECTO);
});

test("lote: leerRegistros ignora líneas cortadas y la última línea por captura gana", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "v3b-"));
  const f = path.join(dir, "l.jsonl");
  const reg = (id: string, d: string) => JSON.stringify({ capture_id: id, resultado: { decision: d }, fuente_decision: "ia" });
  await writeFile(f, `${reg("A", "revision_manual")}\n${reg("A", "aprobada")}\n{"capture_id":"B","res`);
  const rs = await leerRegistros(f);
  assert.equal(rs.length, 1);
  assert.equal(rs[0]!.resultado.decision, "aprobada");
  await asegurarFinDeLinea(f);
  assert.ok((await readFile(f, "utf-8")).endsWith("\n"));
  assert.deepEqual(await leerRegistros(path.join(dir, "no-existe")), []);
});

test("lote: exportarFinal respeta el orden del dataset y completa faltantes con revision_manual", () => {
  const caps = [{ capture_id: "A" }, { capture_id: "B" }] as Captura[];
  const r = ResultadoSchema.parse({ capture_id: "B", decision: "aprobada", confidence_score: 0.97, reason_code: null, validaciones: ok, precio_detectado: 1, codigo_barras_detectado: null, explicacion: "x" });
  const fin = exportarFinal(caps, [{ capture_id: "B", resultado: r } as never]);
  assert.deepEqual(fin.map((x) => [x.capture_id, x.decision]), [["A", "revision_manual"], ["B", "aprobada"]]);
  assert.ok(fin.every((x) => ResultadoSchema.safeParse(x).success));
});
