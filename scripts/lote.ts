// Procesa todas las capturas del dataset con el modelo y guarda cada resultado (reanudable).
// Uso:
//   npm run lote -- --out resultados/lote_dev.jsonl
//   DATA_DIR=./ciego npm run lote -- --out resultados/lote_ciego.jsonl --final resultados/final_ciego.json
// Opciones: --concurrencia 4 · --limite 10 · --ids CAP-1,CAP-2 · --reintentar-errores
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { loadConfig, opcionesFoundry, opcionesImagen, opcionesReglas } from "../server/config.ts";
import { cargarDataset } from "../server/dataset.ts";
import { cargarParametros } from "../server/decision.ts";
import { IndiceDuplicados } from "../server/duplicados.ts";
import { exportarFinal, leerRegistros, procesarLote } from "../server/lote.ts";

const { values } = parseArgs({
  options: {
    out: { type: "string", default: "resultados/lote.jsonl" },
    final: { type: "string" },
    concurrencia: { type: "string", default: "4" },
    limite: { type: "string" },
    ids: { type: "string" },
    "reintentar-errores": { type: "boolean", default: false },
  },
});

const c = loadConfig();
const foundry = opcionesFoundry(c);
if (!foundry) {
  console.error("ERROR: falta FOUNDRY_API_KEY o FOUNDRY_ENDPOINT en .env");
  process.exit(2);
}
const ds = await cargarDataset({ dir: c.DATA_DIR, capturasFile: c.CAPTURAS_FILE, catalogoFile: c.CATALOGO_FILE });
if (!ds.reporte.ok) console.warn("AVISO: el dataset tiene problemas de integridad (npm run dataset:check)");
await mkdir(path.dirname(values.out!), { recursive: true });

const previos = await leerRegistros(values.out!);
const hechos = new Set(previos.filter((r) => !(values["reintentar-errores"] && r.fuente_decision === "error")).map((r) => r.capture_id));
let pendientes = ds.capturas.filter((x) => !hechos.has(x.capture_id));
if (values.ids) {
  const ids = new Set(values.ids.split(","));
  pendientes = pendientes.filter((x) => ids.has(x.capture_id));
}
if (values.limite) pendientes = pendientes.slice(0, Number(values.limite));

console.log(`Dataset: ${ds.dir} · ${ds.capturas.length} capturas · ya procesadas: ${hechos.size} · pendientes: ${pendientes.length}`);
const indice = new IndiceDuplicados(c.DUP_UMBRAL_HAMMING);
const inicio = performance.now();
let tokens = 0;
await procesarLote(
  ds,
  pendientes,
  { foundry, maxTokens: c.MAX_TOKENS_SALIDA, imagen: opcionesImagen(c), leerCodigos: c.LEER_CODIGOS, reglas: opcionesReglas(c), indiceDuplicados: indice, decision: cargarParametros() },
  values.out!,
  Number(values.concurrencia),
  (r, n) => {
    tokens += r.usage.input_tokens + r.usage.output_tokens;
    const marca = r.fuente_decision === "error" ? " ⚠ ERROR" : "";
    console.log(`[${n}/${pendientes.length}] ${r.capture_id} ${r.resultado.decision.padEnd(15)} ${r.fuente_decision.padEnd(5)} ${r.usage.input_tokens}+${r.usage.output_tokens} tok ${r.ms} ms${marca}`);
  },
);

const todos = await leerRegistros(values.out!);
const errores = todos.filter((r) => r.fuente_decision === "error");
const conTokens = todos.filter((r) => r.usage.input_tokens > 0);
console.log(`\nListo en ${Math.round((performance.now() - inicio) / 1000)} s · tokens de esta corrida: ${tokens}`);
console.log(`Total en ${values.out}: ${todos.length}/${ds.capturas.length} · errores técnicos: ${errores.length}${errores.length ? " (reintentar con --reintentar-errores)" : ""}`);
if (conTokens.length) console.log(`Tokens promedio por captura: ${Math.round(conTokens.reduce((s, r) => s + r.usage.input_tokens + r.usage.output_tokens, 0) / conTokens.length)}`);
if (values.final) {
  await writeFile(values.final, JSON.stringify(exportarFinal(ds.capturas, todos), null, 2));
  console.log(`JSON final (${ds.capturas.length} capturas): ${values.final}`);
}
