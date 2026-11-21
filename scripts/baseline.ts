// Genera salidas de referencia para validar el evaluador y tener una línea base.
// Uso: npm run baseline -- <todo_manual|todo_aprobada|todo_rechazada|oraculo> [--out archivo]
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { loadConfig } from "../server/config.ts";
import { resultadoBase } from "../server/baseline.ts";
import { cargarDataset, type Captura } from "../server/dataset.ts";
import type { Decision } from "../server/schemas.ts";

const ESTRATEGIAS = ["todo_manual", "todo_aprobada", "todo_rechazada", "oraculo"] as const;
type Estrategia = (typeof ESTRATEGIAS)[number];

const decisionPara = (e: Estrategia, c: Captura): Decision =>
  e === "todo_manual" ? "revision_manual"
  : e === "todo_aprobada" ? "aprobada"
  : e === "todo_rechazada" ? "rechazada"
  : (c.decision_esperada ?? "revision_manual");

const { values, positionals } = parseArgs({ allowPositionals: true, options: { out: { type: "string" } } });
const estrategia = positionals[0] as Estrategia;
if (!ESTRATEGIAS.includes(estrategia)) {
  console.error(`Uso: npm run baseline -- <${ESTRATEGIAS.join("|")}> [--out archivo]`);
  process.exit(2);
}
const c = loadConfig();
const ds = await cargarDataset({ dir: c.DATA_DIR, capturasFile: c.CAPTURAS_FILE, catalogoFile: c.CATALOGO_FILE });
const salida = ds.capturas.map((x) => resultadoBase(x, decisionPara(estrategia, x)));
const out = values.out ?? path.join("resultados", `baseline_${estrategia}.json`);
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, JSON.stringify(salida, null, 2));
console.log(`${salida.length} resultados → ${out}`);
