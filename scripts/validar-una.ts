// Valida UNA captura del dataset con el modelo real y muestra el resultado, tokens y la respuesta cruda.
// Uso: npm run validar -- CAP-101622
//      npm run validar -- --ping        (solo prueba la conexión con Foundry, sin imágenes)
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { loadConfig, opcionesFoundry } from "../server/config.ts";
import { cargarDataset, TIPOS_IMAGEN } from "../server/dataset.ts";
import { llamarModelo } from "../server/foundry.ts";
import { contextoDesdeCaptura, validarCaptura } from "../server/pipeline.ts";

const { values, positionals } = parseArgs({ allowPositionals: true, options: { ping: { type: "boolean" } } });
const c = loadConfig();
const foundry = opcionesFoundry(c);
if (!foundry) {
  console.error("ERROR: falta FOUNDRY_API_KEY o FOUNDRY_ENDPOINT en .env");
  process.exit(2);
}

if (values.ping) {
  const inicio = performance.now();
  try {
    const r = await llamarModelo(foundry, { system: "Responde breve.", content: [{ type: "text", text: "Di hola." }], maxTokens: 20 });
    console.log(`OK en ${Math.round(performance.now() - inicio)} ms · modelo ${c.FOUNDRY_MODEL} · respuesta: ${r.text.trim()}`);
    console.log(`usage: ${JSON.stringify(r.usage)} · intentos: ${r.intentos}`);
    process.exit(0);
  } catch (e) {
    console.error(`ERROR: ${(e as Error).message}`);
    console.error("401 → revisa la llave · 404 → revisa endpoint y nombre del modelo");
    process.exit(1);
  }
}

const id = positionals[0];
if (!id) {
  console.error("Uso: npm run validar -- <capture_id>   |   npm run validar -- --ping");
  process.exit(2);
}
const ds = await cargarDataset({ dir: c.DATA_DIR, capturasFile: c.CAPTURAS_FILE, catalogoFile: c.CATALOGO_FILE });
const cap = ds.porId.get(id);
if (!cap) {
  console.error(`ERROR: ${id} no está en el dataset`);
  process.exit(2);
}
const rutas = ds.rutas.get(id)!;
const [facade, product, shelf] = await Promise.all(TIPOS_IMAGEN.map((t) => readFile(rutas[t]!)));
const inicio = performance.now();
const s = await validarCaptura(
  { contexto: contextoDesdeCaptura(cap), imagenes: { facade: facade!, product: product!, shelf: shelf! } },
  { foundry, maxTokens: c.MAX_TOKENS_SALIDA },
);
console.log("== RESPUESTA CRUDA DEL MODELO");
console.log(s.respuesta_modelo ?? "(sin respuesta)");
console.log("\n== RESULTADO (JSON oficial)");
console.log(JSON.stringify(s.resultado, null, 2));
console.log(`\nfuente: ${s.fuente_decision} · intentos: ${s.intentos_modelo} · tokens: ${s.usage.input_tokens} in / ${s.usage.output_tokens} out · ${Math.round(performance.now() - inicio)} ms`);
console.log(`esperado: ${cap.decision_esperada ?? "?"}${cap.motivo_rechazo ? ` (${cap.motivo_rechazo})` : ""}`);
