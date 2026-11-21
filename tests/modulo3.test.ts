import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { cargarDataset } from "../server/dataset.ts";
import { resultadoMock } from "../server/mock.ts";
import type { Decision } from "../server/schemas.ts";
import {
  clasificar,
  costoDe,
  evaluar,
  formatearReporte,
  leerSalidas,
  type CapturaEsperada,
} from "../server/scoring.ts";

const cap = (id: string, decision_esperada?: Decision, extra: Partial<CapturaEsperada> = {}): CapturaEsperada => ({
  capture_id: id,
  decision_esperada,
  reason_code_esperado: decision_esperada === "rechazada" ? "CAPTURA_LEJANA" : null,
  capture_price: 42.5,
  product_barcode: "7501234567890",
  ...extra,
});
const res = (id: string, d: Decision, extra: Record<string, unknown> = {}) => ({ ...resultadoMock(id, d), ...extra });
const json = (x: unknown) => JSON.stringify(x);

// ---------- tabla de costo ----------
test("tabla oficial: acierto 0, revisión 1, falso rechazo 3, falso aprobado 10", () => {
  assert.equal(costoDe(clasificar("aprobada", "aprobada")), 0);
  assert.equal(costoDe(clasificar("rechazada", "rechazada")), 0);
  assert.equal(costoDe(clasificar("aprobada", "revision_manual")), 1);
  assert.equal(costoDe(clasificar("rechazada", "revision_manual")), 1);
  assert.equal(costoDe(clasificar("revision_manual", "revision_manual")), 1);
  assert.equal(costoDe(clasificar("aprobada", "rechazada")), 3);
  assert.equal(costoDe(clasificar("rechazada", "aprobada")), 10);
});

test("etiquetada revision_manual: peor caso por defecto y política configurable", () => {
  assert.equal(costoDe(clasificar("revision_manual", "aprobada")), 10);
  assert.equal(costoDe(clasificar("revision_manual", "rechazada")), 3);
  const p = { aprobada: 5, rechazada: 0 };
  assert.equal(costoDe(clasificar("revision_manual", "aprobada"), p), 5);
  assert.equal(costoDe(clasificar("revision_manual", "rechazada"), p), 0);
});

test("sin respuesta cuesta como revisión manual (supuesto)", () => {
  assert.equal(costoDe(clasificar("aprobada", null)), 1);
});

// ---------- lectura de formatos ----------
test("leerSalidas: arreglo, {resultados}, objeto único, envoltorio de la API y JSONL", () => {
  const r = res("CAP-1", "aprobada");
  assert.equal(leerSalidas(json([r, r])).entradas.length, 2);
  assert.equal(leerSalidas(json({ resultados: [r] })).entradas.length, 1);
  assert.equal(leerSalidas(json(r)).entradas.length, 1);
  const env = leerSalidas(json([{ resultado: r, usage: { input_tokens: 100, output_tokens: 20 } }]));
  assert.deepEqual(env.entradas[0]!.usage, { input_tokens: 100, output_tokens: 20 });
  assert.equal((env.entradas[0]!.crudo as { capture_id: string }).capture_id, "CAP-1");
  const jsonl = leerSalidas(`${json(r)}\n\n${json(r)}\n{roto\n`);
  assert.equal(jsonl.entradas.length, 2);
  assert.deepEqual(jsonl.lineas_no_json, ["línea 4"]);
  assert.equal(leerSalidas("").entradas.length, 0);
});

// ---------- evaluación ----------
test("costo total, promedio, matriz y precisión", () => {
  const caps = [cap("A1", "aprobada"), cap("A2", "aprobada"), cap("R1", "rechazada"), cap("M1", "revision_manual")];
  const r = evaluar(caps, json([
    res("A1", "aprobada"),      // 0
    res("A2", "rechazada"),     // 3
    res("R1", "aprobada"),      // 10
    res("M1", "revision_manual"), // 1
  ]));
  assert.equal(r.costo.total, 14);
  assert.equal(r.costo.promedio, 3.5);
  assert.equal(r.aprobaciones.total, 2);
  assert.equal(r.aprobaciones.precision, 0.5);
  assert.equal(r.aprobaciones.cumple_97, false);
  assert.equal(r.matriz.rechazada.aprobada, 1);
  assert.deepEqual(r.detalle.falsos_aprobados, ["R1"]);
  assert.deepEqual(r.detalle.falsos_rechazos, ["A2"]);
});

test("sin aprobaciones: precisión n/a y no cumple 97%", () => {
  const r = evaluar([cap("A1", "aprobada")], json([res("A1", "revision_manual")]));
  assert.equal(r.aprobaciones.precision, null);
  assert.equal(r.aprobaciones.cumple_97, false);
  assert.match(formatearReporte(r), /n\/a/);
});

test("aprobar una etiquetada revision_manual cuenta como aprobación incorrecta", () => {
  const r = evaluar([cap("M1", "revision_manual")], json([res("M1", "aprobada")]));
  assert.equal(r.aprobaciones.correctas, 0);
  assert.deepEqual(r.detalle.manual_aprobadas, ["M1"]);
  assert.equal(r.costo.total, 10);
});

test("JSON: inválidas, faltantes, duplicadas y desconocidas", () => {
  const caps = ["C1", "C2", "C3", "C4"].map((id) => cap(id, "aprobada"));
  const r = evaluar(caps, json([
    res("C1", "aprobada"),
    res("C2", "aprobada", { decision: "quizas" }), // inválida
    res("C3", "aprobada"),
    res("C3", "rechazada"),                         // duplicada → C3 no cuenta
    res("ZZ", "aprobada"),                          // desconocida
    { sin: "capture_id" },                          // inválida sin id
    // C4 falta
  ]));
  assert.equal(r.json.validas, 1);
  assert.equal(r.json.tasa_validas, 0.25);
  assert.equal(r.json.cumple_99, false);
  assert.deepEqual(r.detalle.faltantes, ["C4"]);
  assert.deepEqual(r.detalle.duplicadas, ["C3"]);
  assert.deepEqual(r.detalle.desconocidas, ["ZZ"]);
  assert.equal(r.json.invalidas, 2);
  assert.equal(r.matriz.aprobada.sin_respuesta, 3); // C2, C3, C4
});

test("el esquema oficial se aplica: tipo_precio extra se ignora, 'dudoso' invalida", () => {
  const caps = [cap("C1", "aprobada"), cap("C2", "aprobada")];
  const m = resultadoMock("C2", "aprobada");
  const r = evaluar(caps, json([
    res("C1", "aprobada", { tipo_precio: "regular" }),
    { ...m, validaciones: { ...m.validaciones, producto: "dudoso" } },
  ]));
  assert.equal(r.json.validas, 1);
  assert.equal(r.detalle.invalidas[0]!.capture_id, "C2");
});

test("calidad del dato: reason_code y proxys de precio y código", () => {
  const caps = [cap("R1", "rechazada"), cap("R2", "rechazada"), cap("A1", "aprobada")];
  const r = evaluar(caps, json([
    res("R1", "rechazada", { reason_code: "CAPTURA_LEJANA" }),
    res("R2", "rechazada", { reason_code: "CAPTURA_BORROSA" }),
    res("A1", "aprobada", { precio_detectado: 42.5, codigo_barras_detectado: "07501234567890" }),
  ]));
  assert.equal(r.calidad_dato.tasa_reason_code, 0.5);
  assert.equal(r.detalle.reason_code_distinto[0]!.capture_id, "R2");
  assert.equal(r.calidad_dato.precio_igual_al_capturado, 1);
  assert.equal(r.calidad_dato.codigo_igual_al_esperado, 1); // ignora ceros a la izquierda
});

test("tokens: promedio por captura con usage", () => {
  const caps = [cap("C1", "aprobada"), cap("C2", "aprobada")];
  const r = evaluar(caps, json([
    { resultado: res("C1", "aprobada"), usage: { input_tokens: 1000, output_tokens: 200 } },
    { resultado: res("C2", "aprobada"), usage: { input_tokens: 600, output_tokens: 200 } },
  ]));
  assert.equal(r.tokens.promedio_por_captura, 1000);
  assert.equal(r.tokens.input_total, 1600);
});

test("set ciego (sin etiqueta): solo mide JSON y tokens", () => {
  const r = evaluar([cap("X1"), cap("X2")], json([res("X1", "aprobada")]));
  assert.equal(r.capturas_etiquetadas, 0);
  assert.equal(r.costo.total, 0);
  assert.equal(r.json.validas, 1);
  assert.deepEqual(r.detalle.faltantes, ["X2"]);
});

// ---------- líneas base con datos reales ----------
const hayDatos = existsSync("data/capturas.json");
test("datos reales: costos de las líneas base", { skip: !hayDatos }, async () => {
  const ds = await cargarDataset({ dir: "data", capturasFile: "capturas.json", catalogoFile: "catalogo_productos.csv" });
  const { resultadoBase } = await import("../server/baseline.ts");
  const correr = (f: (d: Decision | undefined) => Decision) =>
    evaluar(ds.capturas, json(ds.capturas.map((c) => resultadoBase(c, f(c.decision_esperada)))));

  const manual = correr(() => "revision_manual");
  const aprobar = correr(() => "aprobada");
  const rechazar = correr(() => "rechazada");
  const oraculo = correr((d) => d!);

  assert.equal(manual.costo.total, 100);
  assert.equal(aprobar.costo.total, 670);       // 34×10 + 33×10
  assert.equal(rechazar.costo.total, 198);      // 33×3 + 33×3
  assert.equal(oraculo.costo.total, 33);        // solo las 33 de revisión manual
  assert.equal(oraculo.aprobaciones.precision, 1);
  assert.equal(oraculo.requisitos_cumplidos, true);
  assert.equal(oraculo.calidad_dato.tasa_reason_code, 1);
  assert.equal(aprobar.aprobaciones.precision, 0.33);
  assert.equal(manual.requisitos_cumplidos, false); // sin aprobaciones
});
