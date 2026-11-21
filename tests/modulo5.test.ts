import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { buildApp } from "../server/app.ts";
import { loadConfig } from "../server/config.ts";
import { digitoVerificadorValido, leerCodigos, mismoCodigo } from "../server/codigo-barras.ts";
import { IndiceDuplicados } from "../server/duplicados.ts";
import { distanciaHamming, escalaParaCaja, hashPerceptual, nitidez, prepararParaModelo, tokensEstimados } from "../server/imagen.ts";
import { validarCaptura } from "../server/pipeline.ts";
import { preprocesarCaptura } from "../server/preprocesado.ts";

const hayDatos = existsSync("data/capturas.json");
const img = (w: number, h: number, color = "#7a7a7a") =>
  sharp({ create: { width: w, height: h, channels: 3, background: color } }).jpeg().toBuffer();

// Tablero de ajedrez: muchos bordes (nítido) y su versión desenfocada.
async function tablero(blur = 0) {
  const n = 256, c = 16;
  const raw = Buffer.alloc(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) raw[y * n + x] = ((x / c) ^ (y / c)) & 1 ? 255 : 0;
  const s = sharp(raw, { raw: { width: n, height: n, channels: 1 } });
  return (blur ? s.blur(blur) : s).jpeg({ quality: 95 }).toBuffer();
}

// ---------- redimensionado ----------
test("escalaParaCaja: 1024×768 horizontal / 768×1024 vertical, sin agrandar", () => {
  const dims = (w: number, h: number) => { const k = escalaParaCaja(w, h); return [Math.round(w * k), Math.round(h * k)]; };
  assert.deepEqual(dims(4096, 3072), [1024, 768]);
  assert.deepEqual(dims(3000, 4000), [768, 1024]);
  assert.deepEqual(dims(4624, 2030), [1024, 450]);
  assert.deepEqual(dims(720, 960), [720, 960]);
  assert.deepEqual(dims(300, 200), [300, 200]);
});

test("prepararParaModelo: imagen grande → JPEG dentro de 1024×768", async () => {
  const p = await prepararParaModelo(await img(4000, 3000));
  assert.deepEqual([p.enviada.ancho, p.enviada.alto], [1024, 768]);
  assert.equal(p.media_type, "image/jpeg");
  assert.equal(p.enviada.redimensionada, true);
  assert.deepEqual([p.original.ancho, p.original.alto], [4000, 3000]);
});

test("prepararParaModelo: imagen que ya cabe se envía sin tocar (mismos bytes); PNG se conserva", async () => {
  const j = await img(720, 960);
  const p = await prepararParaModelo(j);
  assert.equal(p.buffer, j);
  assert.equal(p.enviada.reencodificada, false);
  const png = await sharp({ create: { width: 50, height: 50, channels: 3, background: "#fff" } }).png().toBuffer();
  assert.equal((await prepararParaModelo(png)).media_type, "image/png");
});

test("prepararParaModelo: respeta la orientación EXIF (foto vertical de celular)", async () => {
  const girada = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: "#888" } }).withMetadata({ orientation: 6 }).jpeg().toBuffer();
  const p = await prepararParaModelo(girada);
  assert.deepEqual([p.original.ancho, p.original.alto], [3000, 4000]);
  assert.deepEqual([p.enviada.ancho, p.enviada.alto], [768, 1024]);
});

test("prepararParaModelo: archivo dañado lanza error", async () => {
  const j = await img(100, 100);
  await assert.rejects(prepararParaModelo(j.subarray(0, 40)));
});

test("calidad JPEG configurable reduce bytes", async () => {
  const t = await tablero();
  const grande = await sharp(t).resize(2048, 2048).jpeg().toBuffer();
  const a = await prepararParaModelo(grande, { ladoLargo: 1024, ladoCorto: 768, calidadJpeg: 95 });
  const b = await prepararParaModelo(grande, { ladoLargo: 1024, ladoCorto: 768, calidadJpeg: 50 });
  assert.ok(b.enviada.bytes < a.enviada.bytes);
});

test("tokensEstimados: ~ancho×alto/750 con el reescalado propio de Claude", () => {
  assert.equal(tokensEstimados(1024, 768), 1049);
  assert.equal(tokensEstimados(720, 960), 922);
  assert.ok(tokensEstimados(4096, 3072) <= 1534 && tokensEstimados(4096, 3072) > 1049);
});

// ---------- nitidez y hash ----------
test("nitidez: imagen nítida > desenfocada", async () => {
  const n = await nitidez(await tablero());
  const b = await nitidez(await tablero(6));
  assert.ok(n > b * 3, `${n} vs ${b}`);
});

const svg = (a: string, b: string, cx: number) =>
  sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">
    <defs><linearGradient id="g"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
    <rect width="400" height="300" fill="url(#g)"/><circle cx="${cx}" cy="150" r="70" fill="#202020"/>
    <rect x="260" y="40" width="90" height="200" fill="#f0f0f0"/></svg>`)).jpeg({ quality: 90 }).toBuffer();

test("hash perceptual: misma foto recomprimida ≈ igual; foto distinta ≠", async () => {
  const foto = await svg("#ffcc00", "#0033aa", 120);
  const recomprimida = await sharp(foto).resize(300, 225).jpeg({ quality: 55 }).toBuffer();
  const distinta = await svg("#0033aa", "#ffcc00", 330);
  const [h1, h2, h3] = await Promise.all([hashPerceptual(foto), hashPerceptual(recomprimida), hashPerceptual(distinta)]);
  assert.equal(h1.length, 16);
  assert.ok(distanciaHamming(h1, h2) <= 4, `recomprimida: ${distanciaHamming(h1, h2)}`);
  assert.ok(distanciaHamming(h1, h3) > 10, `distinta: ${distanciaHamming(h1, h3)}`);
});

test("distanciaHamming", () => {
  assert.equal(distanciaHamming("0000000000000000", "0000000000000000"), 0);
  assert.equal(distanciaHamming("0000000000000000", "000000000000000f"), 4);
  assert.equal(distanciaHamming("ffffffffffffffff", "0000000000000000"), 64);
});

test("IndiceDuplicados: detecta, respeta umbral e ignora la misma captura", () => {
  const ix = new IndiceDuplicados(4);
  assert.equal(ix.buscarYRegistrar("product", "A", "00000000000000ff"), null);
  assert.equal(ix.buscarYRegistrar("product", "A", "00000000000000ff"), null); // misma captura
  assert.deepEqual(ix.buscarYRegistrar("product", "B", "00000000000000f0"), { capture_id: "A", distancia: 4 });
  assert.equal(ix.buscarYRegistrar("product", "C", "000000000000ffff"), null); // distancia 8
  assert.equal(ix.buscarYRegistrar("shelf", "D", "00000000000000ff"), null); // otro tipo
});

// ---------- código de barras ----------
test("dígito verificador GTIN (incluye UPC-A sin cero inicial)", () => {
  assert.equal(digitoVerificadorValido("7501372812565"), true);
  assert.equal(digitoVerificadorValido("7501372812566"), false);
  assert.equal(digitoVerificadorValido("75002343"), true); // EAN-8 del catálogo
  assert.equal(digitoVerificadorValido("14800515343"), true); // = 014800515343
  assert.equal(digitoVerificadorValido("750137281256A"), false);
  assert.equal(digitoVerificadorValido("123"), false);
});

test("mismoCodigo ignora ceros a la izquierda y no iguala vacíos", () => {
  assert.equal(mismoCodigo("014800515343", "14800515343"), true);
  assert.equal(mismoCodigo("0000", ""), false);
  assert.equal(mismoCodigo("7501", "7502"), false);
});

test("leerCodigos: imagen sin código → []", async () => {
  assert.deepEqual(await leerCodigos(await img(200, 200)), []);
});

// ---------- datos reales ----------
const leer = (id: string) => Promise.all(["facade", "product", "shelf"].map((t) => readFile(`data/imagenes/${id}_${t}.jpg`)));

test("datos reales: CAP-101622 → fachada 4096×3072 se reduce a 1024×768; producto/etiqueta intactos", { skip: !hayDatos }, async () => {
  const [facade, product, shelf] = await leer("CAP-101622");
  const { enviar, analisis } = await preprocesarCaptura("CAP-101622", { facade: facade!, product: product!, shelf: shelf! });
  assert.deepEqual([analisis.imagenes.facade.enviada.ancho, analisis.imagenes.facade.enviada.alto], [1024, 768]);
  assert.ok(analisis.imagenes.facade.enviada.bytes < facade!.length / 5);
  assert.equal(enviar.product.buffer, product);
  assert.equal(enviar.shelf.buffer, shelf);
});

test("datos reales: CAP-763258 lee el código esperado en la etiqueta", { skip: !hayDatos }, async () => {
  const [facade, product, shelf] = await leer("CAP-763258");
  const { analisis } = await preprocesarCaptura("CAP-763258", { facade: facade!, product: product!, shelf: shelf! }, { codigoEsperado: "7500525495211" });
  assert.equal(analisis.codigo_barras.coincide_esperado, true);
  assert.equal(analisis.codigo_barras.leido_en, "shelf");
  const sin = await preprocesarCaptura("CAP-763258", { facade: facade!, product: product!, shelf: shelf! }, { codigoEsperado: "7500525495211", leerBarras: false });
  assert.equal(sin.analisis.codigo_barras.coincide_esperado, false);
});

// ---------- integración con el pipeline y la API ----------
type Llamada = { body: { messages: { content: { type: string; source?: { data: string; media_type: string } }[] }[] } };
function fakeFetch() {
  const llamadas: Llamada[] = [];
  const texto = JSON.stringify({
    validaciones: { tienda_fachada: "ok", producto: "ok", codigo_barras: "ok", evidencia_precio: "ok" },
    probabilidad_valida: 0.5, decision: "revision_manual", reason_code: null, precio_detectado: null, codigo_barras_detectado: null, explicacion: "x",
  });
  const f = (async (_u: unknown, init?: RequestInit) => {
    llamadas.push({ body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify({ content: [{ type: "text", text: texto }], usage: { input_tokens: 10, output_tokens: 5 } }), { status: 200 });
  }) as typeof fetch;
  return { f, llamadas };
}

test("pipeline: al modelo llega la imagen ya reducida y la salida trae el análisis", async () => {
  const t = fakeFetch();
  const s = await validarCaptura(
    { contexto: { capture_id: "X1" }, imagenes: { facade: await img(4000, 3000), product: await img(720, 960), shelf: await img(720, 960) } },
    { foundry: { apiKey: "k", endpoint: "https://e", model: "m", fetchImpl: t.f } },
  );
  assert.equal(s.fuente_decision, "ia");
  const fachada = t.llamadas[0]!.body.messages[0]!.content.find((b) => b.type === "image")!;
  const meta = await sharp(Buffer.from(fachada.source!.data, "base64")).metadata();
  assert.deepEqual([meta.width, meta.height], [1024, 768]);
  assert.equal(s.analisis?.imagenes.facade.enviada.redimensionada, true);
});

test("pipeline: JPEG truncado → revision_manual sin llamar al modelo", async () => {
  const t = fakeFetch();
  const buena = await img(300, 300);
  const s = await validarCaptura(
    { contexto: { capture_id: "X2" }, imagenes: { facade: buena, product: buena.subarray(0, 60), shelf: buena } },
    { foundry: { apiKey: "k", endpoint: "https://e", model: "m", fetchImpl: t.f } },
  );
  assert.equal(t.llamadas.length, 0);
  assert.equal(s.resultado.decision, "revision_manual");
  assert.match(s.resultado.explicacion, /no se pudo procesar la imagen/);
});

test("API: la misma foto de producto en dos capturas se marca como duplicada (debug)", async () => {
  const t = fakeFetch();
  const app = buildApp(loadConfig({ LOG_LEVEL: "silent", FOUNDRY_API_KEY: "k", FOUNDRY_ENDPOINT: "https://e", DATA_DIR: "no-hay" } as NodeJS.ProcessEnv), { fetchImpl: t.f });
  const producto = await svg("#ffcc00", "#0033aa", 120);
  const enviar = async (id: string, fachadaColor: string) => {
    const fd = new FormData();
    fd.append("meta", JSON.stringify({ capture_id: id }));
    fd.append("fachada", new Blob([await img(300, 300, fachadaColor)], { type: "image/jpeg" }), "f.jpg");
    fd.append("producto", new Blob([producto], { type: "image/jpeg" }), "p.jpg");
    fd.append("etiqueta", new Blob([await img(300, 300, fachadaColor)], { type: "image/jpeg" }), "e.jpg");
    return (await app.inject({ method: "POST", url: "/api/validar?debug=1", payload: fd })).json();
  };
  const a = await enviar("DUP-A", "#111111");
  const b = await enviar("DUP-B", "#eeeeee");
  assert.equal(a.debug.analisis_imagenes.duplicados.product, null);
  assert.equal(b.debug.analisis_imagenes.duplicados.product.capture_id, "DUP-A");
  await app.close();
});
