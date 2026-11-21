// Evaluador de costo operativo y requisitos del reto. Funciones puras: no leen archivos ni llaman al modelo.
import { DECISIONES, ResultadoSchema, UsageSchema, type Decision, type Resultado } from "./schemas.ts";
import type { ReasonCode } from "./reason-codes.ts";

// ---------- Tabla oficial de costo ----------
// Acierto (aprobar válida / rechazar inválida) = 0 · Revisión manual = 1 (siempre)
// Rechazar válida = 3 · Aprobar inválida = 10
export const COSTO = { acierto: 0, revision_manual: 1, falso_rechazo: 3, falso_aprobado: 10 } as const;

// SUPUESTO (no viene en la tabla): una captura etiquetada `revision_manual` no se puede tratar
// como válida ni inválida. Por defecto se asume el peor caso: aprobarla cuesta 10 y rechazarla 3.
// Se puede cambiar con --costo-manual-aprobada / --costo-manual-rechazada en el CLI.
export interface PoliticaManual {
  aprobada: number;
  rechazada: number;
}
export const POLITICA_MANUAL_DEFECTO: PoliticaManual = { aprobada: 10, rechazada: 3 };

export type TipoCosto =
  | "acierto"
  | "revision_manual"
  | "falso_rechazo"
  | "falso_aprobado"
  | "manual_aprobada"
  | "manual_rechazada"
  | "sin_respuesta";

export function clasificar(esperada: Decision, predicha: Decision | null): TipoCosto {
  if (predicha === null) return "sin_respuesta";
  if (predicha === "revision_manual") return "revision_manual";
  if (esperada === "revision_manual") return predicha === "aprobada" ? "manual_aprobada" : "manual_rechazada";
  if (predicha === esperada) return "acierto";
  return predicha === "aprobada" ? "falso_aprobado" : "falso_rechazo";
}

export function costoDe(tipo: TipoCosto, politica: PoliticaManual = POLITICA_MANUAL_DEFECTO): number {
  switch (tipo) {
    case "acierto":
      return COSTO.acierto;
    case "revision_manual":
      return COSTO.revision_manual;
    case "falso_rechazo":
      return COSTO.falso_rechazo;
    case "falso_aprobado":
      return COSTO.falso_aprobado;
    case "manual_aprobada":
      return politica.aprobada;
    case "manual_rechazada":
      return politica.rechazada;
    // SUPUESTO: una captura sin JSON válido se cuenta como revisión manual (alguien la tendría que revisar).
    // Además cuenta en contra del requisito de JSON válido ≥ 99%.
    case "sin_respuesta":
      return COSTO.revision_manual;
  }
}

// ---------- Lectura del archivo de salidas ----------
// Acepta: arreglo JSON, objeto { resultados: [...] }, un solo objeto, o JSONL (un objeto por línea).
// Cada elemento puede ser el Resultado directo o el envoltorio de la API { resultado, usage }.
export interface Entrada {
  crudo: unknown; // lo que se valida contra el esquema
  usage: { input_tokens: number; output_tokens: number } | null;
  origen: string; // "item 3" o "línea 7", para ubicar errores
}

export function leerSalidas(texto: string): { entradas: Entrada[]; lineas_no_json: string[] } {
  const entradas: Entrada[] = [];
  const lineas_no_json: string[] = [];
  const agregar = (item: unknown, origen: string) => {
    let crudo: unknown = item;
    let usage: Entrada["usage"] = null;
    if (item && typeof item === "object" && "resultado" in item) {
      crudo = (item as { resultado: unknown }).resultado;
      const u = UsageSchema.safeParse((item as { usage?: unknown }).usage);
      if (u.success) usage = u.data;
    }
    entradas.push({ crudo, usage, origen });
  };

  const limpio = texto.replace(/^\uFEFF/, "").trim();
  if (limpio === "") return { entradas, lineas_no_json };
  try {
    const todo: unknown = JSON.parse(limpio);
    const lista = Array.isArray(todo)
      ? todo
      : todo && typeof todo === "object" && Array.isArray((todo as { resultados?: unknown }).resultados)
        ? (todo as { resultados: unknown[] }).resultados
        : [todo];
    lista.forEach((x, i) => agregar(x, `item ${i}`));
    return { entradas, lineas_no_json };
  } catch {
    // No es un documento JSON: se intenta JSONL.
  }
  limpio.split(/\r?\n/).forEach((linea, i) => {
    if (linea.trim() === "") return;
    try {
      agregar(JSON.parse(linea), `línea ${i + 1}`);
    } catch {
      lineas_no_json.push(`línea ${i + 1}`);
    }
  });
  return { entradas, lineas_no_json };
}

// ---------- Evaluación ----------
export interface CapturaEsperada {
  capture_id: string;
  decision_esperada?: Decision;
  reason_code_esperado: ReasonCode | null;
  capture_price: number;
  product_barcode: string;
}

export interface OpcionesEvaluacion {
  politicaManual?: PoliticaManual;
}

const FILAS_MATRIZ = DECISIONES;
const COLUMNAS_MATRIZ = [...DECISIONES, "sin_respuesta"] as const;
type ColumnaMatriz = (typeof COLUMNAS_MATRIZ)[number];

export interface Reporte {
  total_capturas: number;
  capturas_etiquetadas: number;
  json: {
    validas: number;
    invalidas: number;
    faltantes: number;
    duplicadas: number;
    desconocidas: number; // capture_id que no está en el dataset
    lineas_no_json: number;
    tasa_validas: number;
    cumple_99: boolean;
  };
  costo: {
    total: number;
    promedio: number;
    por_tipo: Record<TipoCosto, { capturas: number; costo: number }>;
    politica_manual: PoliticaManual;
  };
  aprobaciones: {
    total: number;
    correctas: number;
    precision: number | null; // null si no se aprobó ninguna
    cumple_97: boolean;
  };
  matriz: Record<Decision, Record<ColumnaMatriz, number>>;
  calidad_dato: {
    rechazos_correctos: number;
    reason_code_coincide: number;
    tasa_reason_code: number | null;
    // Proxys (no son métrica oficial): comparan contra los datos capturados en campo.
    aprobadas_con_precio: number;
    precio_igual_al_capturado: number;
    aprobadas_con_codigo: number;
    codigo_igual_al_esperado: number;
  };
  tokens: {
    capturas_con_usage: number;
    input_total: number;
    output_total: number;
    promedio_por_captura: number | null; // input + output, sobre capturas con usage
  };
  detalle: {
    falsos_aprobados: string[];
    manual_aprobadas: string[];
    falsos_rechazos: string[];
    manual_rechazadas: string[];
    reason_code_distinto: { capture_id: string; esperado: string; obtenido: string | null }[];
    invalidas: { capture_id: string | null; origen: string; error: string }[];
    faltantes: string[];
    duplicadas: string[];
    desconocidas: string[];
  };
  requisitos_cumplidos: boolean;
}

const redondear = (x: number, d = 4) => Math.round(x * 10 ** d) / 10 ** d;

export function evaluar(
  capturas: CapturaEsperada[],
  texto: string,
  opts: OpcionesEvaluacion = {},
): Reporte {
  const politica = opts.politicaManual ?? POLITICA_MANUAL_DEFECTO;
  const { entradas, lineas_no_json } = leerSalidas(texto);
  const porId = new Map(capturas.map((c) => [c.capture_id, c]));

  const detalle: Reporte["detalle"] = {
    falsos_aprobados: [],
    manual_aprobadas: [],
    falsos_rechazos: [],
    manual_rechazadas: [],
    reason_code_distinto: [],
    invalidas: [],
    faltantes: [],
    duplicadas: [],
    desconocidas: [],
  };

  // 1) Validar cada entrada contra el esquema oficial y agrupar por capture_id.
  const validos = new Map<string, { r: Resultado; usage: Entrada["usage"] }>();
  const vistos = new Set<string>();
  for (const e of entradas) {
    const id =
      e.crudo && typeof e.crudo === "object" && typeof (e.crudo as { capture_id?: unknown }).capture_id === "string"
        ? (e.crudo as { capture_id: string }).capture_id
        : null;
    if (id !== null && vistos.has(id)) {
      if (!detalle.duplicadas.includes(id)) detalle.duplicadas.push(id);
      continue;
    }
    if (id !== null) vistos.add(id);
    if (id !== null && !porId.has(id)) {
      detalle.desconocidas.push(id);
      continue;
    }
    const p = ResultadoSchema.safeParse(e.crudo);
    if (!p.success) {
      detalle.invalidas.push({
        capture_id: id,
        origen: e.origen,
        error: p.error.issues.map((i) => `${i.path.join(".") || "(raíz)"}: ${i.message}`).join("; "),
      });
      continue;
    }
    validos.set(p.data.capture_id, { r: p.data, usage: e.usage });
  }
  // Una captura duplicada no cuenta como válida: el grader no sabría cuál tomar.
  for (const id of detalle.duplicadas) validos.delete(id);
  for (const l of lineas_no_json) detalle.invalidas.push({ capture_id: null, origen: l, error: "no es JSON" });

  // 2) Costo, matriz, aprobaciones y calidad del dato.
  const porTipo = Object.fromEntries(
    (["acierto", "revision_manual", "falso_rechazo", "falso_aprobado", "manual_aprobada", "manual_rechazada", "sin_respuesta"] as TipoCosto[]).map(
      (t) => [t, { capturas: 0, costo: 0 }],
    ),
  ) as Reporte["costo"]["por_tipo"];
  const matriz = Object.fromEntries(
    FILAS_MATRIZ.map((f) => [f, Object.fromEntries(COLUMNAS_MATRIZ.map((c) => [c, 0]))]),
  ) as Reporte["matriz"];

  let aprobadas = 0;
  let aprobadasCorrectas = 0;
  const cd = {
    rechazos_correctos: 0,
    reason_code_coincide: 0,
    rechazos_con_codigo_esperado: 0,
    aprobadas_con_precio: 0,
    precio_igual_al_capturado: 0,
    aprobadas_con_codigo: 0,
    codigo_igual_al_esperado: 0,
  };
  const tok = { con: 0, input: 0, output: 0 };
  let etiquetadas = 0;
  let costoTotal = 0;

  for (const c of capturas) {
    const v = validos.get(c.capture_id);
    if (!v && !detalle.duplicadas.includes(c.capture_id) && !detalle.invalidas.some((i) => i.capture_id === c.capture_id)) {
      detalle.faltantes.push(c.capture_id);
    }
    if (v?.usage) {
      tok.con++;
      tok.input += v.usage.input_tokens;
      tok.output += v.usage.output_tokens;
    }
    if (!c.decision_esperada) continue; // set ciego: solo cuenta para JSON y tokens
    etiquetadas++;

    const predicha = v?.r.decision ?? null;
    const tipo = clasificar(c.decision_esperada, predicha);
    const costo = costoDe(tipo, politica);
    porTipo[tipo].capturas++;
    porTipo[tipo].costo += costo;
    costoTotal += costo;
    matriz[c.decision_esperada][predicha ?? "sin_respuesta"]++;

    if (tipo === "falso_aprobado") detalle.falsos_aprobados.push(c.capture_id);
    if (tipo === "manual_aprobada") detalle.manual_aprobadas.push(c.capture_id);
    if (tipo === "falso_rechazo") detalle.falsos_rechazos.push(c.capture_id);
    if (tipo === "manual_rechazada") detalle.manual_rechazadas.push(c.capture_id);

    if (predicha === "aprobada") {
      aprobadas++;
      if (c.decision_esperada === "aprobada") aprobadasCorrectas++;
      if (v!.r.precio_detectado !== null) {
        cd.aprobadas_con_precio++;
        if (Math.abs(v!.r.precio_detectado - c.capture_price) < 0.005) cd.precio_igual_al_capturado++;
      }
      if (v!.r.codigo_barras_detectado !== null) {
        cd.aprobadas_con_codigo++;
        if (v!.r.codigo_barras_detectado.replace(/^0+/, "") === c.product_barcode.replace(/^0+/, ""))
          cd.codigo_igual_al_esperado++;
      }
    }
    if (tipo === "acierto" && predicha === "rechazada") {
      cd.rechazos_correctos++;
      if (c.reason_code_esperado) {
        cd.rechazos_con_codigo_esperado++;
        if (v!.r.reason_code === c.reason_code_esperado) cd.reason_code_coincide++;
        else
          detalle.reason_code_distinto.push({
            capture_id: c.capture_id,
            esperado: c.reason_code_esperado,
            obtenido: v!.r.reason_code,
          });
      }
    }
  }

  const total = capturas.length;
  const validas = capturas.filter((c) => validos.has(c.capture_id)).length;
  const tasaValidas = total ? validas / total : 0;
  const precision = aprobadas ? aprobadasCorrectas / aprobadas : null;
  const cumple97 = precision !== null && precision >= 0.97;
  const cumple99 = tasaValidas >= 0.99;

  return {
    total_capturas: total,
    capturas_etiquetadas: etiquetadas,
    json: {
      validas,
      invalidas: detalle.invalidas.length,
      faltantes: detalle.faltantes.length,
      duplicadas: detalle.duplicadas.length,
      desconocidas: detalle.desconocidas.length,
      lineas_no_json: lineas_no_json.length,
      tasa_validas: redondear(tasaValidas),
      cumple_99: cumple99,
    },
    costo: {
      total: costoTotal,
      promedio: etiquetadas ? redondear(costoTotal / etiquetadas) : 0,
      por_tipo: porTipo,
      politica_manual: politica,
    },
    aprobaciones: {
      total: aprobadas,
      correctas: aprobadasCorrectas,
      precision: precision === null ? null : redondear(precision),
      cumple_97: cumple97,
    },
    matriz,
    calidad_dato: {
      rechazos_correctos: cd.rechazos_correctos,
      reason_code_coincide: cd.reason_code_coincide,
      tasa_reason_code: cd.rechazos_con_codigo_esperado
        ? redondear(cd.reason_code_coincide / cd.rechazos_con_codigo_esperado)
        : null,
      aprobadas_con_precio: cd.aprobadas_con_precio,
      precio_igual_al_capturado: cd.precio_igual_al_capturado,
      aprobadas_con_codigo: cd.aprobadas_con_codigo,
      codigo_igual_al_esperado: cd.codigo_igual_al_esperado,
    },
    tokens: {
      capturas_con_usage: tok.con,
      input_total: tok.input,
      output_total: tok.output,
      promedio_por_captura: tok.con ? redondear((tok.input + tok.output) / tok.con, 1) : null,
    },
    detalle,
    requisitos_cumplidos: cumple97 && cumple99,
  };
}

// ---------- Formato legible para consola ----------
const pct = (x: number | null) => (x === null ? "n/a" : `${(x * 100).toFixed(2)}%`);
const marca = (ok: boolean) => (ok ? "CUMPLE" : "NO CUMPLE");

export function formatearReporte(r: Reporte): string {
  const L: string[] = [];
  L.push(`Capturas: ${r.total_capturas} (etiquetadas: ${r.capturas_etiquetadas})`);
  L.push("");
  L.push("== REQUISITOS");
  L.push(`Precisión de aprobaciones: ${pct(r.aprobaciones.precision)} (${r.aprobaciones.correctas}/${r.aprobaciones.total}) ≥ 97% → ${marca(r.aprobaciones.cumple_97)}`);
  L.push(`JSON válido: ${pct(r.json.tasa_validas)} (${r.json.validas}/${r.total_capturas}) ≥ 99% → ${marca(r.json.cumple_99)}`);
  L.push("");
  L.push("== COSTO OPERATIVO (menor es mejor)");
  L.push(`Total: ${r.costo.total} | Promedio por captura: ${r.costo.promedio}`);
  for (const [t, v] of Object.entries(r.costo.por_tipo)) {
    if (v.capturas) L.push(`  ${t.padEnd(17)} ${String(v.capturas).padStart(4)} capturas  costo ${v.costo}`);
  }
  L.push(`  (supuesto: etiquetada revision_manual → aprobar=${r.costo.politica_manual.aprobada}, rechazar=${r.costo.politica_manual.rechazada})`);
  L.push("");
  L.push("== MATRIZ (filas: esperada, columnas: predicha)");
  const cols = ["aprobada", "rechazada", "revision_manual", "sin_respuesta"] as const;
  L.push(`${"".padEnd(16)}${cols.map((c) => c.padStart(16)).join("")}`);
  for (const [f, fila] of Object.entries(r.matriz)) {
    L.push(`${f.padEnd(16)}${cols.map((c) => String(fila[c]).padStart(16)).join("")}`);
  }
  L.push("");
  L.push("== CALIDAD DEL DATO");
  L.push(`reason_code correcto en rechazos acertados: ${pct(r.calidad_dato.tasa_reason_code)} (${r.calidad_dato.reason_code_coincide}/${r.calidad_dato.rechazos_correctos})`);
  L.push(`Proxy precio = capture_price (aprobadas con precio): ${r.calidad_dato.precio_igual_al_capturado}/${r.calidad_dato.aprobadas_con_precio}`);
  L.push(`Proxy código = product_barcode (aprobadas con código): ${r.calidad_dato.codigo_igual_al_esperado}/${r.calidad_dato.aprobadas_con_codigo}`);
  L.push("");
  L.push("== TOKENS");
  L.push(r.tokens.capturas_con_usage
    ? `Promedio por captura: ${r.tokens.promedio_por_captura} (input ${r.tokens.input_total}, output ${r.tokens.output_total}, ${r.tokens.capturas_con_usage} capturas con usage)`
    : "Sin datos de usage en el archivo");
  const d = r.detalle;
  const lista = (titulo: string, xs: string[]) => {
    if (xs.length) L.push(`${titulo} (${xs.length}): ${xs.join(", ")}`);
  };
  L.push("");
  L.push("== DETALLE");
  lista("FALSOS APROBADOS (costo 10)", d.falsos_aprobados);
  lista("Etiquetadas revisión manual pero aprobadas", d.manual_aprobadas);
  lista("Falsos rechazos (costo 3)", d.falsos_rechazos);
  lista("Etiquetadas revisión manual pero rechazadas", d.manual_rechazadas);
  lista("Faltantes", d.faltantes);
  lista("Duplicadas", d.duplicadas);
  lista("capture_id desconocidos", d.desconocidas);
  for (const i of d.invalidas.slice(0, 20)) L.push(`JSON inválido [${i.capture_id ?? "?"} · ${i.origen}]: ${i.error}`);
  if (d.invalidas.length > 20) L.push(`... y ${d.invalidas.length - 20} JSON inválidos más`);
  for (const x of d.reason_code_distinto.slice(0, 20)) L.push(`reason_code distinto ${x.capture_id}: esperado ${x.esperado}, obtenido ${x.obtenido}`);
  L.push("");
  if (r.capturas_etiquetadas === 0) {
    L.push(`SET SIN ETIQUETAS: solo se mide JSON válido → ${marca(r.json.cumple_99)}`);
  } else {
    L.push(r.requisitos_cumplidos ? "RESULTADO: CUMPLE REQUISITOS" : "RESULTADO: NO CUMPLE REQUISITOS");
  }
  return L.join("\n");
}
