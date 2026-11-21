// Lectura local de códigos de barras (zxing-wasm). El .wasm se carga desde node_modules, sin red.
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";

let listo: Promise<unknown> | null = null;
function inicializar() {
  listo ??= (async () => {
    const require = createRequire(import.meta.url);
    const wasm = await readFile(require.resolve("zxing-wasm/reader/zxing_reader.wasm"));
    const binario = wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) as ArrayBuffer;
    return prepareZXingModule({ overrides: { wasmBinary: binario }, fireImmediately: true });
  })();
  return listo;
}

// Se lee la imagen ORIGINAL (antes de redimensionar): a 768 px se pierden la mitad de las lecturas.
export async function leerCodigos(buf: Buffer): Promise<string[]> {
  await inicializar();
  const r = await readBarcodes(new Uint8Array(buf), {
    formats: ["EAN13", "EAN8", "UPCA", "UPCE"],
    tryHarder: true,
    maxNumberOfSymbols: 8,
  });
  return [...new Set(r.filter((x) => x.isValid).map((x) => x.text))];
}

const normalizar = (c: string) => c.replace(/\D/g, "").replace(/^0+/, "");
export const mismoCodigo = (a: string, b: string) => normalizar(a) !== "" && normalizar(a) === normalizar(b);

// Dígito verificador GTIN (EAN-8, UPC-A, EAN-13, GTIN-14). Acepta 11 dígitos: UPC-A que perdió el cero
// inicial al guardarse como número (ej. 14800515343 = 014800515343). Los ceros a la izquierda no alteran el cálculo.
export function digitoVerificadorValido(codigo: string): boolean {
  const d = codigo.trim();
  if (!/^\d+$/.test(d) || ![8, 11, 12, 13, 14].includes(d.length)) return false;
  const cuerpo = d.slice(0, -1).split("").reverse().map(Number);
  const suma = cuerpo.reduce((s, n, i) => s + n * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (suma % 10)) % 10 === Number(d.at(-1));
}
