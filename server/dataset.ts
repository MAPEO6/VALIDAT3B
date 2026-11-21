import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { parseCsv } from "./csv.ts";
import { ApiError } from "./errors.ts";
import { MOTIVO_DATASET_A_REASON_CODE, type ReasonCode } from "./reason-codes.ts";
import { DECISIONES } from "./schemas.ts";

export const TIPOS_IMAGEN = ["facade", "product", "shelf"] as const;
export type TipoImagen = (typeof TIPOS_IMAGEN)[number];

const texto = z.string().trim();
// Los códigos de barras llegan como número en el JSON: se guardan siempre como string.
const codigo = z.union([z.string(), z.number()]).transform((v) => String(v).trim());
const vacioAUndefined = (v: unknown) => (v === "" || v === null ? undefined : v);

// Filas de capturas.json (mismos nombres de campo que el diccionario del LEEME).
const CapturaSchema = z.object({
  capture_id: texto.min(1),
  capture_store_name: texto,
  capture_date: texto,
  capture_barcode: codigo,
  capture_price: z.coerce.number(),
  capture_brand: texto,
  id_product: z.coerce.number().int(),
  product_name: texto,
  product_barcode: codigo,
  product_price: z.coerce.number(),
  min_product_price: z.coerce.number(),
  max_product_price: z.coerce.number(),
  unit_product: texto,
  unit_quantity_product: z.coerce.number(),
  product_group: texto,
  product_line: texto,
  facade_file: texto.min(1),
  product_file: texto.min(1),
  shelf_file: texto.min(1),
  facade_url: z.string().optional(),
  product_url: z.string().optional(),
  shelf_url: z.string().optional(),
  // Solo existen en el set de desarrollo (con etiqueta). Opcionales por si el set ciego no los trae.
  decision_esperada: z.preprocess(vacioAUndefined, z.enum(DECISIONES).optional()),
  motivo_rechazo: z.preprocess(vacioAUndefined, z.string().optional()),
});
export type CapturaRaw = z.infer<typeof CapturaSchema>;
export type Captura = CapturaRaw & { reason_code_esperado: ReasonCode | null };

const ProductoSchema = z.object({
  id_product: z.coerce.number().int(),
  product_name: texto,
  product_barcode: codigo,
  product_price: z.coerce.number(),
  min_product_price: z.coerce.number(),
  max_product_price: z.coerce.number(),
  unit_product: texto,
  unit_quantity_product: z.coerce.number(),
  product_group: texto,
  product_line: texto,
});
export type ProductoCatalogo = z.infer<typeof ProductoSchema>;

export interface ReporteIntegridad {
  ok: boolean;
  capturas_cargadas: number;
  catalogo_productos: number;
  filas_invalidas: { indice: number; error: string }[];
  ids_duplicados: string[];
  imagenes_faltantes: { capture_id: string; tipo: TipoImagen; archivo: string }[];
  productos_fuera_de_catalogo: { capture_id: string; id_product: number }[];
  codigo_barras_distinto_catalogo: {
    capture_id: string;
    en_captura: string;
    en_catalogo: string;
  }[];
  // Aviso (no afecta `ok`): motivo_rechazo del dataset sin equivalente en REASON_CODES.
  motivos_sin_reason_code: string[];
}

export interface Dataset {
  dir: string;
  capturas: Captura[];
  porId: Map<string, Captura>;
  catalogo: Map<number, ProductoCatalogo>;
  // Ruta absoluta de cada imagen, o null si no existe / está fuera del directorio de datos.
  rutas: Map<string, Record<TipoImagen, string | null>>;
  reporte: ReporteIntegridad;
}

export interface OpcionesDataset {
  dir: string;
  capturasFile: string;
  catalogoFile: string;
}

const ARCHIVO_DE: Record<TipoImagen, "facade_file" | "product_file" | "shelf_file"> = {
  facade: "facade_file",
  product: "product_file",
  shelf: "shelf_file",
};

async function existe(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export async function cargarDataset(opts: OpcionesDataset): Promise<Dataset> {
  const dir = path.resolve(opts.dir);
  const rutaCapturas = path.join(dir, opts.capturasFile);
  const rutaCatalogo = path.join(dir, opts.catalogoFile);

  let crudoCapturas: unknown;
  try {
    const texto = await readFile(rutaCapturas, "utf-8");
    crudoCapturas = rutaCapturas.toLowerCase().endsWith(".csv") ? parseCsv(texto) : JSON.parse(texto);
  } catch (e) {
    throw new Error(`No se pudo leer ${rutaCapturas}: ${(e as Error).message}`, { cause: e });
  }
  if (!Array.isArray(crudoCapturas)) {
    throw new Error(`${rutaCapturas} debe contener un arreglo JSON de capturas`);
  }
  let filasCatalogo: Record<string, string>[];
  try {
    filasCatalogo = parseCsv(await readFile(rutaCatalogo, "utf-8"));
  } catch (e) {
    throw new Error(`No se pudo leer ${rutaCatalogo}: ${(e as Error).message}`, { cause: e });
  }

  const reporte: ReporteIntegridad = {
    ok: true,
    capturas_cargadas: 0,
    catalogo_productos: 0,
    filas_invalidas: [],
    ids_duplicados: [],
    imagenes_faltantes: [],
    productos_fuera_de_catalogo: [],
    codigo_barras_distinto_catalogo: [],
    motivos_sin_reason_code: [],
  };

  const catalogo = new Map<number, ProductoCatalogo>();
  filasCatalogo.forEach((fila, i) => {
    const p = ProductoSchema.safeParse(fila);
    if (p.success) catalogo.set(p.data.id_product, p.data);
    else reporte.filas_invalidas.push({ indice: i, error: `catalogo: ${p.error.message}` });
  });
  reporte.catalogo_productos = catalogo.size;

  const capturas: Captura[] = [];
  const porId = new Map<string, Captura>();
  const rutas = new Map<string, Record<TipoImagen, string | null>>();
  const motivosSinCodigo = new Set<string>();

  for (const [i, fila] of crudoCapturas.entries()) {
    const p = CapturaSchema.safeParse(fila);
    if (!p.success) {
      reporte.filas_invalidas.push({ indice: i, error: p.error.message });
      continue;
    }
    const raw = p.data;
    if (porId.has(raw.capture_id)) {
      reporte.ids_duplicados.push(raw.capture_id);
      continue;
    }

    let reasonCode: ReasonCode | null = null;
    if (raw.motivo_rechazo) {
      reasonCode = MOTIVO_DATASET_A_REASON_CODE[raw.motivo_rechazo] ?? null;
      if (!reasonCode) motivosSinCodigo.add(raw.motivo_rechazo);
    }
    const captura: Captura = { ...raw, reason_code_esperado: reasonCode };
    capturas.push(captura);
    porId.set(captura.capture_id, captura);

    const producto = catalogo.get(captura.id_product);
    if (!producto) {
      reporte.productos_fuera_de_catalogo.push({
        capture_id: captura.capture_id,
        id_product: captura.id_product,
      });
    } else if (producto.product_barcode !== captura.product_barcode) {
      reporte.codigo_barras_distinto_catalogo.push({
        capture_id: captura.capture_id,
        en_captura: captura.product_barcode,
        en_catalogo: producto.product_barcode,
      });
    }

    const r = { facade: null, product: null, shelf: null } as Record<TipoImagen, string | null>;
    for (const tipo of TIPOS_IMAGEN) {
      const archivo = captura[ARCHIVO_DE[tipo]];
      const abs = path.resolve(dir, archivo);
      const dentro = abs.startsWith(dir + path.sep);
      if (dentro && (await existe(abs))) r[tipo] = abs;
      else reporte.imagenes_faltantes.push({ capture_id: captura.capture_id, tipo, archivo });
    }
    rutas.set(captura.capture_id, r);
  }

  reporte.capturas_cargadas = capturas.length;
  reporte.motivos_sin_reason_code = [...motivosSinCodigo];
  reporte.ok =
    reporte.filas_invalidas.length === 0 &&
    reporte.ids_duplicados.length === 0 &&
    reporte.imagenes_faltantes.length === 0 &&
    reporte.productos_fuera_de_catalogo.length === 0 &&
    reporte.codigo_barras_distinto_catalogo.length === 0;

  return { dir, capturas, porId, catalogo, rutas, reporte };
}

export type ProveedorDataset = () => Promise<Dataset>;

// Carga perezosa: el servidor arranca aunque falten los datos; las rutas del dataset
// responden 503 con un mensaje claro y reintentan en la siguiente petición.
export function crearProveedorDataset(opts: OpcionesDataset): ProveedorDataset {
  let cache: Promise<Dataset> | null = null;
  return async () => {
    cache ??= cargarDataset(opts);
    try {
      return await cache;
    } catch (e) {
      cache = null;
      throw new ApiError(503, "DATASET_NO_DISPONIBLE", (e as Error).message);
    }
  };
}
