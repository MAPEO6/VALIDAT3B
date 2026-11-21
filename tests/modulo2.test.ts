import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildApp } from "../server/app.ts";
import { loadConfig } from "../server/config.ts";
import { parseCsv } from "../server/csv.ts";
import { cargarDataset, crearProveedorDataset } from "../server/dataset.ts";
import { ErrorSchema } from "../server/schemas.ts";

const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9]);

const base = (id: string, extra: Record<string, unknown> = {}) => ({
  capture_id: id,
  capture_store_name: "Soriana",
  capture_date: "2026-11-18 22:00:00",
  capture_barcode: 7501058611062,
  capture_price: 20,
  capture_brand: "Nestle",
  id_product: 7,
  product_name: "Leche evaporada",
  product_barcode: 7501058611062,
  product_price: 22,
  min_product_price: 4,
  max_product_price: 64.5,
  unit_product: "mililitro",
  unit_quantity_product: 360,
  product_group: "(30) Lacti",
  product_line: "(03) Leches",
  facade_file: `imagenes/${id}_facade.jpg`,
  product_file: `imagenes/${id}_product.jpg`,
  shelf_file: `imagenes/${id}_shelf.jpg`,
  facade_url: "https://x/f.jpg",
  product_url: "https://x/p.jpg",
  shelf_url: "https://x/s.jpg",
  decision_esperada: "aprobada",
  motivo_rechazo: "",
  ...extra,
});

const CATALOGO =
  "﻿id_product,product_name,product_barcode,product_price,min_product_price,max_product_price,unit_product,unit_quantity_product,product_group,product_line\r\n" +
  '7,"Leche, evaporada",7501058611062,22.0,4.0,64.5,mililitro,360.0,(30) Lacti,(03) Leches\r\n';

let dir: string; // fixture con casos buenos y malos
let dirOk: string; // fixture sin problemas

async function crearFixture(capturas: unknown[], imagenes: string[]) {
  const d = await mkdtemp(path.join(os.tmpdir(), "v3b-"));
  await mkdir(path.join(d, "imagenes"));
  await writeFile(path.join(d, "capturas.json"), JSON.stringify(capturas));
  await writeFile(path.join(d, "catalogo_productos.csv"), CATALOGO);
  for (const f of imagenes) await writeFile(path.join(d, "imagenes", f), JPG);
  return d;
}
const todas = (id: string) => ["facade", "product", "shelf"].map((t) => `${id}_${t}.jpg`);
const opts = (d: string) => ({ dir: d, capturasFile: "capturas.json", catalogoFile: "catalogo_productos.csv" });

before(async () => {
  dirOk = await crearFixture(
    [
      base("CAP-1"),
      base("CAP-2", { decision_esperada: "rechazada", motivo_rechazo: "Capturas lejanas", capture_store_name: "Neto" }),
      base("CAP-3", { decision_esperada: "revision_manual" }),
    ],
    [...todas("CAP-1"), ...todas("CAP-2"), ...todas("CAP-3")],
  );
  dir = await crearFixture(
    [
      base("CAP-1"),
      base("CAP-1"), // duplicado
      base("CAP-2", { id_product: 999 }), // fuera de catálogo
      base("CAP-3", { product_barcode: 111 }), // barcode distinto al catálogo
      base("CAP-4", { shelf_file: "imagenes/no_existe.jpg" }), // imagen faltante
      base("CAP-5", { facade_file: "../secreto.txt" }), // fuera del directorio
      base("CAP-6", { capture_price: "abc" }), // fila inválida
      base("CAP-7", { motivo_rechazo: "Motivo nuevo", decision_esperada: "rechazada" }),
    ],
    [...todas("CAP-1"), ...todas("CAP-2"), ...todas("CAP-3"), ...todas("CAP-4").slice(0, 2), ...todas("CAP-5").slice(1), ...todas("CAP-7")],
  );
  await writeFile(path.join(dir, "..", "secreto.txt"), "no debe servirse");
});
after(async () => {
  await rm(dir, { recursive: true, force: true });
  await rm(dirOk, { recursive: true, force: true });
});

const appCon = (d: string) =>
  buildApp(
    loadConfig({ LOG_LEVEL: "silent" } as NodeJS.ProcessEnv),
    { dataset: crearProveedorDataset(opts(d)) },
  );

// ---------- CSV ----------
test("csv: BOM, CRLF, comillas con comas y comillas escapadas", () => {
  const filas = parseCsv('﻿a,b\r\n"x, y","di ""hola"""\r\n1,2\r\n');
  assert.deepEqual(filas, [{ a: "x, y", b: 'di "hola"' }, { a: "1", b: "2" }]);
});

// ---------- cargador ----------
test("carga fixture limpio: códigos de barras como string y reason_code derivado", async () => {
  const ds = await cargarDataset(opts(dirOk));
  assert.equal(ds.reporte.ok, true);
  assert.equal(ds.capturas.length, 3);
  assert.equal(ds.porId.get("CAP-1")!.capture_barcode, "7501058611062");
  assert.equal(ds.porId.get("CAP-2")!.reason_code_esperado, "CAPTURA_LEJANA");
  assert.equal(ds.porId.get("CAP-1")!.reason_code_esperado, null);
  assert.equal(ds.catalogo.get(7)!.product_name, "Leche, evaporada");
});

test("detecta duplicados, fuera de catálogo, barcode distinto, imágenes faltantes y filas inválidas", async () => {
  const r = (await cargarDataset(opts(dir))).reporte;
  assert.equal(r.ok, false);
  assert.deepEqual(r.ids_duplicados, ["CAP-1"]);
  assert.deepEqual(r.productos_fuera_de_catalogo.map((x) => x.capture_id), ["CAP-2"]);
  assert.deepEqual(r.codigo_barras_distinto_catalogo.map((x) => x.capture_id), ["CAP-3"]);
  assert.ok(r.imagenes_faltantes.some((x) => x.capture_id === "CAP-4" && x.tipo === "shelf"));
  assert.equal(r.filas_invalidas.length, 1);
  assert.deepEqual(r.motivos_sin_reason_code, ["Motivo nuevo"]);
});

test("ruta fuera del directorio de datos se marca como faltante (path traversal)", async () => {
  const ds = await cargarDataset(opts(dir));
  assert.equal(ds.rutas.get("CAP-5")!.facade, null);
  assert.ok(ds.reporte.imagenes_faltantes.some((x) => x.capture_id === "CAP-5" && x.tipo === "facade"));
});

test("directorio inexistente → error claro", async () => {
  await assert.rejects(
    cargarDataset(opts(path.join(dir, "no-existe"))),
    /No se pudo leer/,
  );
});

// ---------- endpoints ----------
test("GET /api/capturas: lista, paginación y URLs de imágenes", async () => {
  const app = appCon(dirOk);
  const r = await app.inject({ method: "GET", url: "/api/capturas?limit=2&offset=1" });
  const b = r.json();
  assert.equal(r.statusCode, 200);
  assert.equal(b.total, 3);
  assert.equal(b.items.length, 2);
  assert.equal(b.items[0].capture_id, "CAP-2");
  assert.equal(b.items[0].imagenes.shelf, "/api/imagenes/CAP-2/shelf");
  await app.close();
});

test("GET /api/capturas: filtros por decisión, tienda, motivo y texto", async () => {
  const app = appCon(dirOk);
  const ids = async (qs: string) =>
    (await app.inject({ method: "GET", url: `/api/capturas?${qs}` })).json().items.map((c: { capture_id: string }) => c.capture_id);
  assert.deepEqual(await ids("decision=rechazada"), ["CAP-2"]);
  assert.deepEqual(await ids("tienda=neto"), ["CAP-2"]);
  assert.deepEqual(await ids("motivo=Capturas%20lejanas"), ["CAP-2"]);
  assert.deepEqual(await ids("q=cap-3"), ["CAP-3"]);
  await app.close();
});

test("GET /api/capturas: parámetros inválidos → 400 SOLICITUD_INVALIDA", async () => {
  const app = appCon(dirOk);
  for (const qs of ["decision=otra", "limit=0", "limit=999", "offset=-1"]) {
    const r = await app.inject({ method: "GET", url: `/api/capturas?${qs}` });
    assert.equal(r.statusCode, 400, qs);
    assert.equal(ErrorSchema.parse(r.json()).error.code, "SOLICITUD_INVALIDA");
  }
  await app.close();
});

test("GET /api/capturas/:id: detalle y 404", async () => {
  const app = appCon(dirOk);
  const ok = await app.inject({ method: "GET", url: "/api/capturas/CAP-1" });
  assert.equal(ok.json().product_name, "Leche evaporada");
  assert.equal(ok.json().imagenes.facade, "/api/imagenes/CAP-1/facade");
  const no = await app.inject({ method: "GET", url: "/api/capturas/CAP-X" });
  assert.equal(no.statusCode, 404);
  assert.equal(no.json().error.code, "NO_ENCONTRADO");
  await app.close();
});

test("GET /api/imagenes: sirve bytes con content-type y rechaza casos inválidos", async () => {
  const app = appCon(dir);
  const ok = await app.inject({ method: "GET", url: "/api/imagenes/CAP-7/product" });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.headers["content-type"], "image/jpeg");
  assert.deepEqual(ok.rawPayload, JPG);
  for (const url of [
    "/api/imagenes/CAP-X/product", // captura inexistente
    "/api/imagenes/CAP-7/otro", // tipo inválido
    "/api/imagenes/CAP-4/shelf", // archivo faltante
    "/api/imagenes/CAP-5/facade", // fuera del directorio: nunca se sirve
  ]) {
    const r = await app.inject({ method: "GET", url });
    assert.equal(r.statusCode, 404, url);
    assert.equal(r.json().error.code, "NO_ENCONTRADO");
  }
  await app.close();
});

test("GET /api/dataset/resumen: conteos e integridad", async () => {
  const app = appCon(dirOk);
  const b = (await app.inject({ method: "GET", url: "/api/dataset/resumen" })).json();
  assert.equal(b.total, 3);
  assert.deepEqual(b.por_decision_esperada, { aprobada: 1, rechazada: 1, revision_manual: 1 });
  assert.deepEqual(b.por_motivo_rechazo, { "Capturas lejanas": 1 });
  assert.equal(b.integridad.ok, true);
  await app.close();
});

test("sin datos: 503 DATASET_NO_DISPONIBLE y /api/health sigue respondiendo", async () => {
  const app = appCon(path.join(dir, "no-existe"));
  const r = await app.inject({ method: "GET", url: "/api/capturas" });
  assert.equal(r.statusCode, 503);
  assert.equal(ErrorSchema.parse(r.json()).error.code, "DATASET_NO_DISPONIBLE");
  assert.equal((await app.inject({ method: "GET", url: "/api/health" })).statusCode, 200);
  await app.close();
});

// ---------- datos reales (se omiten si no está la carpeta data/) ----------
const hayDatos = existsSync("data/capturas.json");
test("datos reales: 100 capturas, 300 imágenes, 0 problemas de integridad", { skip: !hayDatos }, async () => {
  const ds = await cargarDataset({ dir: "data", capturasFile: "capturas.json", catalogoFile: "catalogo_productos.csv" });
  assert.equal(ds.reporte.ok, true, JSON.stringify(ds.reporte));
  assert.equal(ds.capturas.length, 100);
  assert.equal([...ds.rutas.values()].flatMap((r) => Object.values(r)).filter(Boolean).length, 300);
  const conteo = (f: (c: (typeof ds.capturas)[number]) => boolean) => ds.capturas.filter(f).length;
  assert.equal(conteo((c) => c.decision_esperada === "aprobada"), 33);
  assert.equal(conteo((c) => c.decision_esperada === "rechazada"), 34);
  assert.equal(conteo((c) => c.decision_esperada === "revision_manual"), 33);
  assert.equal(conteo((c) => c.decision_esperada === "rechazada" && c.reason_code_esperado === null), 0);
});

test("datos reales: la imagen servida es idéntica al archivo", { skip: !hayDatos }, async () => {
  const app = buildApp(loadConfig({ LOG_LEVEL: "silent", DATA_DIR: "data" } as NodeJS.ProcessEnv));
  const r = await app.inject({ method: "GET", url: "/api/imagenes/CAP-101622/facade" });
  const { readFile } = await import("node:fs/promises");
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.rawPayload, await readFile("data/imagenes/CAP-101622_facade.jpg"));
  await app.close();
});
