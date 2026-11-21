import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import sharp from "sharp";
import { cargarDataset } from "../server/dataset.ts";
import { campoDesdeCaptura, validarCaptura } from "../server/pipeline.ts";
import type { AnalisisCaptura } from "../server/preprocesado.ts";
import { piden_revision, reglasPosteriores, reglasPrevias, type DatosCampo } from "../server/reglas.ts";
import { ResultadoSchema } from "../server/schemas.ts";

const campo: DatosCampo = { codigo_capturado: "7501372812565", codigo_esperado: "7501372812565", precio_capturado: 30, precio_min: 21, precio_max: 38.5 };
const efecto = (senales: ReturnType<typeof reglasPrevias>, regla: string) => senales.find((x) => x.regla === regla)?.efecto;

const analisis = (extra: Partial<AnalisisCaptura> = {}): AnalisisCaptura => ({
  imagenes: {} as AnalisisCaptura["imagenes"],
  codigo_barras: { leidos: [], coincide_esperado: false, leido_en: null },
  duplicados: { product: null, shelf: null },
  tokens_imagen_estimados: 0,
  ms: 0,
  ...extra,
});

// ---------- reglas previas ----------
test("previas: captura limpia no pide revisión", () => {
  const r = reglasPrevias(campo, analisis());
  assert.equal(piden_revision(r).length, 0);
  assert.equal(efecto(r, "CODIGO_CAPTURADO_VALIDO"), "ok");
  assert.equal(efecto(r, "CODIGO_CAPTURADO_IGUAL_ESPERADO"), "ok");
  assert.equal(efecto(r, "PRECIO_CAPTURADO_EN_RANGO"), "ok");
  assert.equal(efecto(r, "CODIGO_LEIDO_LOCAL"), "info");
});

test("previas: dígito verificador inválido → revisión", () => {
  const r = reglasPrevias({ ...campo, codigo_capturado: "7501372812566", codigo_esperado: "7501372812566" });
  assert.equal(efecto(r, "CODIGO_CAPTURADO_VALIDO"), "revision");
});

test("previas: código capturado ≠ esperado → revisión (no rechazo: podría ser contratipo)", () => {
  const r = reglasPrevias({ ...campo, codigo_capturado: "7501003110305" });
  assert.equal(efecto(r, "CODIGO_CAPTURADO_IGUAL_ESPERADO"), "revision");
});

test("previas: UPC-A sin cero inicial se considera el mismo código", () => {
  const r = reglasPrevias({ ...campo, codigo_capturado: "14800515343", codigo_esperado: "014800515343" });
  assert.equal(piden_revision(r).length, 0);
});

test("previas: precio capturado fuera de rango → revisión; en el límite → ok", () => {
  assert.equal(efecto(reglasPrevias({ ...campo, precio_capturado: 50 }), "PRECIO_CAPTURADO_EN_RANGO"), "revision");
  assert.equal(efecto(reglasPrevias({ ...campo, precio_capturado: 38.5 }), "PRECIO_CAPTURADO_EN_RANGO"), "ok");
});

test("previas: foto reutilizada → revisión; código leído localmente → ok", () => {
  const r = reglasPrevias(campo, analisis({
    duplicados: { product: { capture_id: "CAP-OTRA", distancia: 2 }, shelf: null },
    codigo_barras: { leidos: ["7501372812565"], coincide_esperado: true, leido_en: "shelf" },
  }));
  assert.equal(efecto(r, "FOTO_REUTILIZADA"), "revision");
  assert.match(r.find((x) => x.regla === "FOTO_REUTILIZADA")!.detalle, /CAP-OTRA/);
  assert.equal(efecto(r, "CODIGO_LEIDO_LOCAL"), "ok");
});

test("previas: sin datos de campo no se evalúa nada (no inventa fallas)", () => {
  assert.equal(reglasPrevias({}).length, 0);
});

// ---------- reglas posteriores ----------
test("posteriores: precio leído = capturado → ok; distinto → revisión (default)", () => {
  assert.equal(piden_revision(reglasPosteriores(campo, 30)).length, 0);
  assert.equal(piden_revision(reglasPosteriores(campo, 30.005)).length, 0); // tolerancia 0.01
  const r = reglasPosteriores(campo, 32);
  assert.equal(r.find((x) => x.regla === "PRECIO_DETECTADO_IGUAL_CAPTURADO")!.efecto, "revision");
});

test("posteriores: con 'ignorar' la discrepancia es solo informativa", () => {
  const r = reglasPosteriores(campo, 32, { precioDiscrepancia: "ignorar", toleranciaPrecio: 0.01 });
  assert.equal(r.find((x) => x.regla === "PRECIO_DETECTADO_IGUAL_CAPTURADO")!.efecto, "info");
});

test("posteriores: precio leído fuera de rango → revisión; null → sin reglas", () => {
  assert.equal(reglasPosteriores(campo, 99).find((x) => x.regla === "PRECIO_DETECTADO_EN_RANGO")!.efecto, "revision");
  assert.deepEqual(reglasPosteriores(campo, null), []);
});

// ---------- integración ----------
const jpg = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#777" } }).jpeg().toBuffer();
const imagenes = { facade: jpg, product: jpg, shelf: jpg };
function fakeFetch(ia: Record<string, unknown>) {
  let n = 0;
  const f = (async () => {
    n++;
    return new Response(JSON.stringify({ content: [{ type: "text", text: JSON.stringify(ia) }], usage: { input_tokens: 100, output_tokens: 10 } }), { status: 200 });
  }) as typeof fetch;
  return { f, llamadas: () => n };
}
const aprobar = (precio: number | null) => ({
  validaciones: { tienda_fachada: "ok", producto: "ok", codigo_barras: "ok", evidencia_precio: "ok" },
  probabilidad_valida: 0.99, decision: "aprobada", reason_code: null, precio_detectado: precio, codigo_barras_detectado: null, explicacion: "Todo bien.",
});
const foundry = (f: typeof fetch) => ({ apiKey: "k", endpoint: "https://e", model: "m", fetchImpl: f });

test("pipeline: regla previa en revisión → no llama al modelo (0 tokens), fuente 'regla'", async () => {
  const t = fakeFetch(aprobar(30));
  const s = await validarCaptura({ contexto: { capture_id: "R1" }, imagenes, campo: { ...campo, precio_capturado: 99 } }, { foundry: foundry(t.f) });
  assert.equal(t.llamadas(), 0);
  assert.equal(s.fuente_decision, "regla");
  assert.equal(s.resultado.decision, "revision_manual");
  assert.equal(s.usage.input_tokens, 0);
  assert.match(s.resultado.explicacion, /fuera de/);
  assert.equal(ResultadoSchema.safeParse(s.resultado).success, true);
});

test("pipeline: aprobada con precio distinto al capturado → revision_manual", async () => {
  const t = fakeFetch(aprobar(32));
  const s = await validarCaptura({ contexto: { capture_id: "R2" }, imagenes, campo }, { foundry: foundry(t.f) });
  assert.equal(s.resultado.decision, "revision_manual");
  assert.match(s.resultado.explicacion, /\$32 ≠ capturado \$30/);
  assert.equal(s.fuente_decision, "ia");
});

test("pipeline: aprobada con precio igual al capturado → sigue aprobada", async () => {
  const t = fakeFetch(aprobar(30));
  const s = await validarCaptura({ contexto: { capture_id: "R3" }, imagenes, campo }, { foundry: foundry(t.f) });
  assert.equal(s.resultado.decision, "aprobada");
  assert.ok(s.reglas.some((x) => x.regla === "PRECIO_DETECTADO_IGUAL_CAPTURADO" && x.efecto === "ok"));
});

test("pipeline: un rechazo del modelo no se toca por discrepancia de precio", async () => {
  const t = fakeFetch({ ...aprobar(32), decision: "rechazada", reason_code: "CAPTURA_LEJANA", probabilidad_valida: 0.05,
    validaciones: { tienda_fachada: "ok", producto: "falla", codigo_barras: "ok", evidencia_precio: "ok" } });
  const s = await validarCaptura({ contexto: { capture_id: "R4" }, imagenes, campo }, { foundry: foundry(t.f) });
  assert.equal(s.resultado.decision, "rechazada");
});

// ---------- dataset real ----------
test("datos reales: las reglas previas no bloquean ninguna de las 100 capturas", { skip: !existsSync("data/capturas.json") }, async () => {
  const ds = await cargarDataset({ dir: "data", capturasFile: "capturas.json", catalogoFile: "catalogo_productos.csv" });
  const bloqueadas = ds.capturas.filter((c) => piden_revision(reglasPrevias(campoDesdeCaptura(c))).length > 0);
  assert.deepEqual(bloqueadas.map((c) => c.capture_id), []);
});
