// Analiza las imágenes de todo el dataset SIN llamar al modelo (0 tokens).
// Uso: npm run imagenes:analizar      → resultados/analisis_imagenes.{json,csv} + resumen en consola
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { loadConfig, opcionesImagen } from "../server/config.ts";
import { cargarDataset, TIPOS_IMAGEN } from "../server/dataset.ts";
import { IndiceDuplicados } from "../server/duplicados.ts";
import { preprocesarCaptura, type AnalisisCaptura } from "../server/preprocesado.ts";

const c = loadConfig();
const ds = await cargarDataset({ dir: c.DATA_DIR, capturasFile: c.CAPTURAS_FILE, catalogoFile: c.CATALOGO_FILE });
const indice = new IndiceDuplicados(c.DUP_UMBRAL_HAMMING);
const filas: { capture_id: string; esperada: string; motivo: string; a: AnalisisCaptura }[] = [];
let originalesBytes = 0;
let tokensSinRedimensionar = 0;
const { tokensEstimados } = await import("../server/imagen.ts");

for (const cap of ds.capturas) {
  const rutas = ds.rutas.get(cap.capture_id)!;
  const [facade, product, shelf] = await Promise.all(TIPOS_IMAGEN.map((t) => readFile(rutas[t]!)));
  const { analisis } = await preprocesarCaptura(cap.capture_id, { facade: facade!, product: product!, shelf: shelf! }, {
    imagen: opcionesImagen(c),
    codigoEsperado: cap.product_barcode,
    indice,
    leerBarras: c.LEER_CODIGOS,
  });
  for (const i of Object.values(analisis.imagenes)) {
    originalesBytes += i.original.bytes;
    tokensSinRedimensionar += tokensEstimados(i.original.ancho, i.original.alto);
  }
  filas.push({ capture_id: cap.capture_id, esperada: cap.decision_esperada ?? "", motivo: cap.motivo_rechazo ?? "", a: analisis });
  process.stdout.write(".");
}
console.log("");

await mkdir("resultados", { recursive: true });
await writeFile("resultados/analisis_imagenes.json", JSON.stringify(filas, null, 2));
const cab = ["capture_id", "decision_esperada", "motivo_rechazo", ...TIPOS_IMAGEN.flatMap((t) => [`${t}_original`, `${t}_enviada`, `${t}_nitidez`]), "codigos_leidos", "codigo_coincide", "dup_product", "dup_shelf", "tokens_imagen_est"];
const csv = [cab.join(",")].concat(
  filas.map(({ capture_id, esperada, motivo, a }) =>
    [
      capture_id, esperada, `"${motivo}"`,
      ...TIPOS_IMAGEN.flatMap((t) => [`${a.imagenes[t].original.ancho}x${a.imagenes[t].original.alto}`, `${a.imagenes[t].enviada.ancho}x${a.imagenes[t].enviada.alto}`, a.imagenes[t].nitidez]),
      `"${a.codigo_barras.leidos.join(" ")}"`, a.codigo_barras.coincide_esperado, a.duplicados.product?.capture_id ?? "", a.duplicados.shelf?.capture_id ?? "", a.tokens_imagen_estimados,
    ].join(","),
  ),
);
await writeFile("resultados/analisis_imagenes.csv", "﻿" + csv.join("\n"));

// ---------- Resumen ----------
const mediana = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)]! : 0;
};
const grupo = (f: (x: (typeof filas)[number]) => boolean) => filas.filter(f);
const grupos: [string, typeof filas][] = [
  ["aprobada", grupo((x) => x.esperada === "aprobada")],
  ["revision_manual", grupo((x) => x.esperada === "revision_manual")],
  ["rech. lejanas", grupo((x) => x.motivo === "Capturas lejanas")],
  ["rech. borrosas", grupo((x) => x.motivo === "Capturas borrosas")],
  ["rech. desc. incompleta", grupo((x) => x.motivo === "Descripción de producto incompleta")],
];
const enviadosBytes = filas.reduce((s, x) => s + Object.values(x.a.imagenes).reduce((t, i) => t + i.enviada.bytes, 0), 0);
const tokensEnviados = filas.reduce((s, x) => s + x.a.tokens_imagen_estimados, 0);
const redim = filas.reduce((s, x) => s + Object.values(x.a.imagenes).filter((i) => i.enviada.redimensionada).length, 0);

console.log(`Capturas: ${filas.length} · imágenes redimensionadas: ${redim}/${filas.length * 3}`);
console.log(`Bytes: ${(originalesBytes / 1e6).toFixed(1)} MB originales → ${(enviadosBytes / 1e6).toFixed(1)} MB enviados`);
console.log(`Tokens de imagen estimados por captura: ${Math.round(tokensSinRedimensionar / filas.length)} sin redimensionar → ${Math.round(tokensEnviados / filas.length)} con 1024×768`);
console.log("\nNitidez mediana (más alto = más nítida)      facade  product  shelf");
for (const [nombre, g] of grupos) {
  const m = (t: (typeof TIPOS_IMAGEN)[number]) => String(mediana(g.map((x) => x.a.imagenes[t].nitidez))).padStart(8);
  console.log(`${nombre.padEnd(24)} (${String(g.length).padStart(2)})          ${m("facade")} ${m("product")} ${m("shelf")}`);
}
console.log("\nCódigo esperado leído localmente:");
for (const [nombre, g] of grupos) console.log(`  ${nombre.padEnd(24)} ${g.filter((x) => x.a.codigo_barras.coincide_esperado).length}/${g.length}`);
const dups = filas.filter((x) => x.a.duplicados.product || x.a.duplicados.shelf);
console.log(`\nFotos de producto/etiqueta duplicadas entre capturas: ${dups.length}${dups.length ? " → " + dups.map((x) => `${x.capture_id}≈${(x.a.duplicados.product ?? x.a.duplicados.shelf)!.capture_id}`).join(", ") : ""}`);
console.log("\nArchivos: resultados/analisis_imagenes.json · resultados/analisis_imagenes.csv");
