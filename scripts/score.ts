// Uso:
//   npm run score -- resultados/salida.json
//   npm run score -- resultados/salida.jsonl --json resultados/reporte.json
//   npm run score -- salida.json --costo-manual-aprobada 10 --costo-manual-rechazada 1
import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { loadConfig } from "../server/config.ts";
import { cargarDataset } from "../server/dataset.ts";
import { evaluar, formatearReporte, POLITICA_MANUAL_DEFECTO } from "../server/scoring.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    json: { type: "string" },
    "costo-manual-aprobada": { type: "string" },
    "costo-manual-rechazada": { type: "string" },
  },
});

const archivo = positionals[0];
if (!archivo) {
  console.error("Uso: npm run score -- <archivo de salidas .json|.jsonl> [--json reporte.json]");
  process.exit(2);
}
const num = (v: string | undefined, def: number) => {
  if (v === undefined) return def;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) {
    console.error(`Valor inválido: ${v}`);
    process.exit(2);
  }
  return n;
};

try {
  const c = loadConfig();
  const ds = await cargarDataset({ dir: c.DATA_DIR, capturasFile: c.CAPTURAS_FILE, catalogoFile: c.CATALOGO_FILE });
  const reporte = evaluar(ds.capturas, await readFile(archivo, "utf-8"), {
    politicaManual: {
      aprobada: num(values["costo-manual-aprobada"], POLITICA_MANUAL_DEFECTO.aprobada),
      rechazada: num(values["costo-manual-rechazada"], POLITICA_MANUAL_DEFECTO.rechazada),
    },
  });
  console.log(`Archivo: ${archivo}`);
  console.log(formatearReporte(reporte));
  if (values.json) {
    await writeFile(values.json, JSON.stringify(reporte, null, 2));
    console.log(`Reporte JSON: ${values.json}`);
  }
} catch (e) {
  console.error(`ERROR: ${(e as Error).message}`);
  process.exit(2);
}
