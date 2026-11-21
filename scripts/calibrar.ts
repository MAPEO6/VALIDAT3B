// Recalcula decisiones sobre un lote YA procesado (0 tokens) y busca los parámetros de menor costo
// que cumplan precisión de aprobaciones ≥ 97%. Necesita etiquetas (set de desarrollo).
// Uso:
//   npm run calibrar -- resultados/lote_dev.jsonl                 → muestra los mejores parámetros
//   npm run calibrar -- resultados/lote_dev.jsonl --guardar       → los guarda en config/decision.json
// Aplicar parámetros guardados a otro lote (ej. el ciego) y exportar el JSON final:
//   DATA_DIR=./ciego npm run calibrar -- resultados/lote_ciego.jsonl --aplicar --final resultados/final_ciego.json
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { loadConfig } from "../server/config.ts";
import { cargarDataset } from "../server/dataset.ts";
import { cargarParametros, decidir, PARAMETROS_DEFECTO, RUTA_PARAMETROS, type ParametrosDecision } from "../server/decision.ts";
import { exportarFinal, leerRegistros, type RegistroLote } from "../server/lote.ts";
import { evaluar, formatearReporte } from "../server/scoring.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    guardar: { type: "boolean", default: false },
    aplicar: { type: "boolean", default: false },
    final: { type: "string" },
    top: { type: "string", default: "8" },
  },
});
const archivo = positionals[0];
if (!archivo) {
  console.error("Uso: npm run calibrar -- <lote.jsonl> [--guardar] | [--aplicar --final salida.json]");
  process.exit(2);
}
const c = loadConfig();
const ds = await cargarDataset({ dir: c.DATA_DIR, capturasFile: c.CAPTURAS_FILE, catalogoFile: c.CATALOGO_FILE });
const registros = await leerRegistros(archivo);
if (!registros.length) {
  console.error(`ERROR: ${archivo} no tiene registros`);
  process.exit(2);
}

const redecidir = (P: ParametrosDecision): RegistroLote[] =>
  registros.map((r) => (r.ia && r.fuente_decision === "ia" ? { ...r, resultado: decidir(r.capture_id, r.ia, r.reglas, r.codigo_barras ? { codigo_barras: r.codigo_barras } : undefined, P) } : r));
const puntuar = (rs: RegistroLote[]) => evaluar(ds.capturas, JSON.stringify(rs.map((r) => ({ resultado: r.resultado, usage: r.usage }))));

if (values.aplicar) {
  const P = cargarParametros();
  const rs = redecidir(P);
  console.log(`Parámetros (${RUTA_PARAMETROS}): ${JSON.stringify(P)}`);
  const conteo: Record<string, number> = {};
  for (const r of rs) conteo[r.resultado.decision] = (conteo[r.resultado.decision] ?? 0) + 1;
  console.log(`Decisiones: ${JSON.stringify(conteo)}`);
  if (ds.capturas.some((x) => x.decision_esperada)) console.log(formatearReporte(puntuar(rs)));
  if (values.final) {
    await mkdir(path.dirname(values.final), { recursive: true });
    await writeFile(values.final, JSON.stringify(exportarFinal(ds.capturas, rs), null, 2));
    console.log(`JSON final (${ds.capturas.length} capturas): ${values.final}`);
  }
  process.exit(0);
}

if (!ds.capturas.some((x) => x.decision_esperada)) {
  console.error("ERROR: para calibrar se necesita el set con etiquetas (decision_esperada).");
  process.exit(2);
}

// Búsqueda en rejilla.
const rejilla: ParametrosDecision[] = [];
for (const umbralAprobar of [0.8, 0.85, 0.9, 0.93, 0.95, 0.97, 0.99])
  for (const umbralAprobarConCodigo of [0.7, 0.8, 0.9, umbralAprobar])
    for (const umbralRechazar of [0.05, 0.1, 0.2, 0.3, 0.4, 0.5])
      for (const respetarRevisionModelo of [true, false])
        for (const respetarDecisionModelo of [true, false])
          for (const precioBloqueaAprobacion of [true, false])
            if (umbralAprobarConCodigo <= umbralAprobar)
              rejilla.push({ umbralAprobar, umbralAprobarConCodigo, umbralRechazar, respetarRevisionModelo, respetarDecisionModelo, precioBloqueaAprobacion, inferirReasonCode: true });

const filas = rejilla.map((P) => ({ P, r: puntuar(redecidir(P)) }));
// Orden: cumple 97% → menor costo → más conservador (umbral de aprobación más alto).
filas.sort((a, b) =>
  Number(b.r.aprobaciones.cumple_97) - Number(a.r.aprobaciones.cumple_97) ||
  a.r.costo.total - b.r.costo.total ||
  b.P.umbralAprobar - a.P.umbralAprobar,
);

const base = puntuar(redecidir(PARAMETROS_DEFECTO));
console.log(`Registros: ${registros.length} · combinaciones probadas: ${rejilla.length}`);
console.log(`Parámetros por defecto → costo ${base.costo.total}, precisión ${base.aprobaciones.precision ?? "n/a"}, aprobadas ${base.aprobaciones.total}\n`);
console.log("costo  precisión  aprob  rech  rev   uA    uA+cod  uR    respRev respDec precio");
for (const { P, r } of filas.slice(0, Number(values.top))) {
  const m = r.matriz;
  const rech = m.aprobada.rechazada + m.rechazada.rechazada + m.revision_manual.rechazada;
  const rev = m.aprobada.revision_manual + m.rechazada.revision_manual + m.revision_manual.revision_manual;
  console.log(
    `${String(r.costo.total).padStart(5)}  ${String(r.aprobaciones.precision ?? "n/a").padStart(9)}  ${String(r.aprobaciones.total).padStart(5)}  ${String(rech).padStart(4)}  ${String(rev).padStart(3)}   ${P.umbralAprobar.toFixed(2)}  ${P.umbralAprobarConCodigo.toFixed(2)}    ${P.umbralRechazar.toFixed(2)}  ${String(P.respetarRevisionModelo).padEnd(7)} ${String(P.respetarDecisionModelo).padEnd(7)} ${P.precioBloqueaAprobacion}`,
  );
}
const mejor = filas[0]!;
console.log(`\nMejor: ${JSON.stringify(mejor.P)}`);
console.log(formatearReporte(mejor.r));
if (values.guardar) {
  await mkdir(path.dirname(RUTA_PARAMETROS), { recursive: true });
  await writeFile(RUTA_PARAMETROS, JSON.stringify(mejor.P, null, 2) + "\n");
  console.log(`\nGuardado en ${RUTA_PARAMETROS} (lo usan el servidor, el lote y --aplicar).`);
}
