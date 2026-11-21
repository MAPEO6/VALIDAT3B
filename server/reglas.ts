// Reglas deterministas: se resuelven en código, sin el modelo.
// - Previas: con los datos de campo y el análisis local. Si alguna pide revisión, NO se llama al modelo (ahorra tokens).
// - Posteriores: comparan lo que leyó el modelo contra los datos de campo.
// Efecto en este módulo (seguro respecto a costo): una señal "revision" nunca permite aprobar.
// El motor de decisión (módulo 7) usa estas señales para el resto.
import { digitoVerificadorValido, mismoCodigo } from "./codigo-barras.ts";
import type { AnalisisCaptura } from "./preprocesado.ts";

export interface DatosCampo {
  codigo_capturado?: string; // capture_barcode
  codigo_esperado?: string; // product_barcode
  precio_capturado?: number; // capture_price
  precio_min?: number;
  precio_max?: number;
}

export type EfectoRegla = "ok" | "revision" | "info";
export type Validacion = "tienda_fachada" | "producto" | "codigo_barras" | "evidencia_precio";

export interface Senal {
  regla: string;
  efecto: EfectoRegla;
  validacion: Validacion | null;
  detalle: string;
}

export interface OpcionesReglas {
  precioDiscrepancia: "revision" | "ignorar"; // qué hacer si el precio leído ≠ capturado
  toleranciaPrecio: number; // diferencia máxima en pesos para considerar iguales
}
export const OPCIONES_REGLAS_DEFECTO: OpcionesReglas = { precioDiscrepancia: "revision", toleranciaPrecio: 0.01 };

const s = (regla: string, efecto: EfectoRegla, validacion: Validacion | null, detalle: string): Senal => ({ regla, efecto, validacion, detalle });

export function reglasPrevias(campo: DatosCampo, analisis?: AnalisisCaptura): Senal[] {
  const out: Senal[] = [];

  if (campo.codigo_capturado !== undefined) {
    out.push(
      digitoVerificadorValido(campo.codigo_capturado)
        ? s("CODIGO_CAPTURADO_VALIDO", "ok", "codigo_barras", `dígito verificador correcto (${campo.codigo_capturado})`)
        : s("CODIGO_CAPTURADO_VALIDO", "revision", "codigo_barras", `el código capturado ${campo.codigo_capturado} no tiene un dígito verificador válido`),
    );
  }
  if (campo.codigo_capturado !== undefined && campo.codigo_esperado !== undefined) {
    // Sin lista de contratipos permitidos no se puede rechazar: un código distinto podría ser un contratipo válido.
    out.push(
      mismoCodigo(campo.codigo_capturado, campo.codigo_esperado)
        ? s("CODIGO_CAPTURADO_IGUAL_ESPERADO", "ok", "codigo_barras", "el código capturado es el del producto esperado")
        : s("CODIGO_CAPTURADO_IGUAL_ESPERADO", "revision", "codigo_barras", `código capturado ${campo.codigo_capturado} ≠ esperado ${campo.codigo_esperado}`),
    );
  }
  if (campo.precio_capturado !== undefined && campo.precio_min !== undefined && campo.precio_max !== undefined) {
    const dentro = campo.precio_capturado >= campo.precio_min && campo.precio_capturado <= campo.precio_max;
    out.push(
      dentro
        ? s("PRECIO_CAPTURADO_EN_RANGO", "ok", "evidencia_precio", `$${campo.precio_capturado} dentro de [$${campo.precio_min}, $${campo.precio_max}]`)
        : s("PRECIO_CAPTURADO_EN_RANGO", "revision", "evidencia_precio", `$${campo.precio_capturado} fuera de [$${campo.precio_min}, $${campo.precio_max}]`),
    );
  }
  if (analisis) {
    for (const tipo of ["product", "shelf"] as const) {
      const d = analisis.duplicados[tipo];
      if (d) {
        out.push(
          s("FOTO_REUTILIZADA", "revision", tipo === "product" ? "producto" : "evidencia_precio",
            `la foto de ${tipo === "product" ? "producto" : "etiqueta"} es casi idéntica a la de ${d.capture_id} (distancia ${d.distancia})`),
        );
      }
    }
    const cb = analisis.codigo_barras;
    if (cb.coincide_esperado === true) {
      out.push(s("CODIGO_LEIDO_LOCAL", "ok", "codigo_barras", `código esperado leído en la foto de ${cb.leido_en === "product" ? "producto" : "etiqueta"}`));
    } else {
      // No leerlo o leer otro (productos vecinos en el anaquel) no prueba que falle.
      out.push(s("CODIGO_LEIDO_LOCAL", "info", "codigo_barras", cb.leidos.length ? `se leyeron otros códigos: ${cb.leidos.join(", ")}` : "no se leyó ningún código"));
    }
  }
  return out;
}

export function reglasPosteriores(
  campo: DatosCampo,
  precioDetectado: number | null,
  opts: OpcionesReglas = OPCIONES_REGLAS_DEFECTO,
): Senal[] {
  const out: Senal[] = [];
  if (precioDetectado === null) return out; // el modelo ya marcó evidencia_precio
  if (campo.precio_capturado !== undefined) {
    const igual = Math.abs(precioDetectado - campo.precio_capturado) <= opts.toleranciaPrecio;
    out.push(
      igual
        ? s("PRECIO_DETECTADO_IGUAL_CAPTURADO", "ok", "evidencia_precio", `etiqueta $${precioDetectado} = capturado $${campo.precio_capturado}`)
        : s("PRECIO_DETECTADO_IGUAL_CAPTURADO", opts.precioDiscrepancia === "revision" ? "revision" : "info", "evidencia_precio",
            `etiqueta $${precioDetectado} ≠ capturado $${campo.precio_capturado}`),
    );
  }
  if (campo.precio_min !== undefined && campo.precio_max !== undefined) {
    const dentro = precioDetectado >= campo.precio_min && precioDetectado <= campo.precio_max;
    out.push(
      dentro
        ? s("PRECIO_DETECTADO_EN_RANGO", "ok", "evidencia_precio", `$${precioDetectado} dentro del rango de referencia`)
        : s("PRECIO_DETECTADO_EN_RANGO", "revision", "evidencia_precio", `$${precioDetectado} fuera de [$${campo.precio_min}, $${campo.precio_max}]`),
    );
  }
  return out;
}

export const piden_revision = (senales: Senal[]) => senales.filter((x) => x.efecto === "revision");
export const resumen = (senales: Senal[]) => senales.map((x) => x.detalle).join("; ");
