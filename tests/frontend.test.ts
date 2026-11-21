import { test } from "node:test";
import assert from "node:assert/strict";
import { resultadoMock, resultadoTecnico } from "../server/mock.ts";
import { ResultadoSchema, type RespuestaValidar } from "../server/schemas.ts";
import {
  capturaErrorTecnico,
  motivoDe,
  resultadoACaptura,
  toApiJson,
} from "../src/mapping.ts";
import {
  digitoVerificadorOk,
  mismoArchivo,
  validarArchivo,
  validarCaptureId,
  validarCodigoBarras,
  validarDimensiones,
  validarPrecio,
  validarProducto,
} from "../src/validation.ts";

const MB = 1024 * 1024;
const datos = { captureId: "CAP-000200", tienda: "", codigo: "7501234567893", producto: "Ariel 900g" };

// ---------- archivos ----------
test("archivo: acepta JPG/PNG/WEBP dentro del límite", () => {
  for (const type of ["image/jpeg", "image/png", "image/webp"]) {
    assert.equal(validarArchivo({ name: "a", size: 2 * MB, type }), null);
  }
});

test("archivo: rechaza tipos que no son imagen, vacíos y demasiado grandes", () => {
  assert.match(validarArchivo({ name: "doc.pdf", size: 10, type: "application/pdf" })!, /no es una imagen/);
  assert.match(validarArchivo({ name: "a.gif", size: 10, type: "image/gif" })!, /JPG, PNG o WEBP/);
  assert.match(validarArchivo({ name: "a.jpg", size: 0, type: "image/jpeg" })!, /vacío/);
  assert.match(validarArchivo({ name: "a.jpg", size: 26 * MB, type: "image/jpeg" })!, /máximo es 25 MB/);
});

test("archivo: resolución mínima y detección de duplicados", () => {
  assert.equal(validarDimensiones("a.jpg", 4096, 3072), null);
  assert.match(validarDimensiones("a.jpg", 300, 800)!, /320 px/);
  const a = { name: "x.jpg", size: 10, type: "image/jpeg", lastModified: 1 };
  assert.equal(mismoArchivo(a, { ...a }), true);
  assert.equal(mismoArchivo(a, { ...a, lastModified: 2 }), false);
});

// ---------- formulario ----------
test("capture_id: vacío permitido, caracteres inválidos y duplicados bloquean", () => {
  const ids = new Set(["CAP-000091"]);
  assert.deepEqual(validarCaptureId("", ids), {});
  assert.deepEqual(validarCaptureId("CAP-101622", ids), {});
  assert.ok(validarCaptureId("CAP 1", ids).error);
  assert.ok(validarCaptureId("CAP-000091", ids).error);
  assert.ok(validarCaptureId("x".repeat(41), ids).error);
  assert.ok(validarCaptureId("lote7", ids).aviso); // formato no habitual: solo aviso
});

test("código de barras: longitud GS1 bloquea, dígito verificador solo avisa", () => {
  assert.equal(digitoVerificadorOk("7501234567893"), true);
  assert.equal(digitoVerificadorOk("7501234567890"), false);
  assert.equal(digitoVerificadorOk("96385074"), true); // EAN-8
  assert.deepEqual(validarCodigoBarras(""), {});
  assert.ok(validarCodigoBarras("", true).error);
  assert.ok(validarCodigoBarras("75012A").error);
  assert.ok(validarCodigoBarras("12345").error);
  assert.deepEqual(validarCodigoBarras("7501 2345 6789 3"), {});
  const r = validarCodigoBarras("7501234567890");
  assert.equal(r.error, undefined);
  assert.ok(r.aviso);
});

test("producto y precio", () => {
  assert.deepEqual(validarProducto(""), {});
  assert.ok(validarProducto("", true).error);
  assert.ok(validarProducto("ab").error);
  assert.ok(validarProducto("x".repeat(121)).error);
  assert.deepEqual(validarPrecio("34.50"), {});
  assert.deepEqual(validarPrecio("34,5"), {});
  for (const malo of ["", "0", "-3", "abc", "1.234", "200000"]) {
    assert.ok(validarPrecio(malo).error, `debería rechazar «${malo}»`);
  }
});

// ---------- contrato backend ↔ UI ----------
const resp = (r: ReturnType<typeof resultadoMock>, fuente: "mock" | "error" = "mock"): RespuestaValidar => ({
  resultado: r,
  usage: { input_tokens: 0, output_tokens: 0 },
  meta: { latencia_ms: 5, fuente_decision: fuente },
});

test("mapeo: aprobada → validada con las 4 validaciones en ok", () => {
  const c = resultadoACaptura(resp(resultadoMock("CAP-000200", "aprobada")), datos, [], "Hoy");
  assert.equal(c.status, "validada");
  assert.equal(c.motivo, "—");
  assert.deepEqual(c.val, { f: "ok", p: "ok", c: "ok", e: "ok" });
  assert.equal(c.producto, "Ariel 900g");
});

test("mapeo: rechazada conserva reason_code; revision_manual explica baja confianza", () => {
  const r = resultadoACaptura(resp(resultadoMock("CAP-1", "rechazada")), datos, [], "Hoy");
  assert.equal(r.status, "rechazada");
  assert.equal(r.motivo, "PRODUCTO_NO_COINCIDE");
  assert.equal(r.val.p, "falla");
  const m = resultadoACaptura(resp(resultadoMock("CAP-2", "revision_manual")), datos, [], "Hoy");
  assert.equal(m.status, "revision");
  assert.equal(motivoDe(m), "BAJA_CONFIANZA");
  assert.equal(m.precio, null);
});

test("mapeo: fuente_decision 'error' → revisión con ERROR_TECNICO y validaciones sin datos", () => {
  const c = resultadoACaptura(resp(resultadoTecnico("CAP-3", "timeout"), "error"), datos, [], "Hoy");
  assert.equal(c.status, "revision");
  assert.equal(c.fuente, "error");
  assert.equal(motivoDe(c), "ERROR_TECNICO");
  assert.equal(c.confianza, null);
  assert.deepEqual(c.val, { f: "na", p: "na", c: "na", e: "na" });
  assert.match(c.errorMsg, /timeout/);
});

test("toApiJson cumple el contrato del backend en todos los casos", () => {
  const casos = [
    resultadoACaptura(resp(resultadoMock("CAP-1", "aprobada")), datos, [], "Hoy"),
    resultadoACaptura(resp(resultadoMock("CAP-2", "rechazada")), datos, [], "Hoy"),
    resultadoACaptura(resp(resultadoMock("CAP-3", "revision_manual")), datos, [], "Hoy"),
    capturaErrorTecnico("CAP-4", datos, [], "Hoy", "sin conexión"),
  ];
  // Decisión manual: sin confianza del modelo y validaciones confirmadas por el revisor.
  casos.push({ ...casos[0], id: "CAP-5", origen: "Manual", confianza: null });
  for (const c of casos) {
    const json = toApiJson(c);
    const r = ResultadoSchema.safeParse(json);
    assert.ok(r.success, `${c.id}: ${JSON.stringify(r.error?.issues)}`);
  }
});
