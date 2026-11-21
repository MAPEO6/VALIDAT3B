// Uso: npm run dataset:check   (verifica que capturas, catálogo e imágenes estén completos)
import { loadConfig } from "../server/config.ts";
import { cargarDataset } from "../server/dataset.ts";

const c = loadConfig();
try {
  const ds = await cargarDataset({
    dir: c.DATA_DIR,
    capturasFile: c.CAPTURAS_FILE,
    catalogoFile: c.CATALOGO_FILE,
  });
  const r = ds.reporte;
  console.log(`Directorio: ${ds.dir}`);
  console.log(`Capturas cargadas: ${r.capturas_cargadas} | catálogo: ${r.catalogo_productos} productos`);
  console.log(`Filas inválidas: ${r.filas_invalidas.length}`);
  console.log(`IDs duplicados: ${r.ids_duplicados.length}`);
  console.log(`Imágenes faltantes: ${r.imagenes_faltantes.length}`);
  console.log(`Productos fuera de catálogo: ${r.productos_fuera_de_catalogo.length}`);
  console.log(`Código de barras distinto al catálogo: ${r.codigo_barras_distinto_catalogo.length}`);
  if (r.motivos_sin_reason_code.length)
    console.log(`AVISO motivos sin reason_code: ${r.motivos_sin_reason_code.join(", ")}`);
  if (!r.ok) console.log(JSON.stringify(r, null, 2));
  console.log(r.ok ? "RESULTADO: OK" : "RESULTADO: CON PROBLEMAS");
  process.exit(r.ok ? 0 : 1);
} catch (e) {
  console.error(`RESULTADO: ERROR - ${(e as Error).message}`);
  process.exit(2);
}
