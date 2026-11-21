// Procesamiento local de imágenes con sharp: redimensionado para el modelo, nitidez y hash perceptual.
import sharp from "sharp";

export interface OpcionesImagen {
  ladoLargo: number; // 1024
  ladoCorto: number; // 768
  calidadJpeg: number; // 85
}
export const OPCIONES_IMAGEN_DEFECTO: OpcionesImagen = { ladoLargo: 1024, ladoCorto: 768, calidadJpeg: 85 };

export interface InfoImagen {
  ancho: number;
  alto: number;
  bytes: number;
  formato: string;
}

export interface ImagenPreparada {
  buffer: Buffer;
  media_type: string;
  original: InfoImagen;
  enviada: InfoImagen & { redimensionada: boolean; reencodificada: boolean };
}

const MEDIA: Record<string, string> = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };

// Escala para caber en 1024×768 (horizontal) o 768×1024 (vertical), sin agrandar.
export function escalaParaCaja(ancho: number, alto: number, o: OpcionesImagen = OPCIONES_IMAGEN_DEFECTO): number {
  const largo = Math.max(ancho, alto);
  const corto = Math.min(ancho, alto);
  return Math.min(1, o.ladoLargo / largo, o.ladoCorto / corto);
}

// Deja la imagen lista para el modelo. Si ya cabe en la caja, es un formato aceptado y no tiene rotación EXIF,
// se envía tal cual (sin pérdida). Si no, se rota según EXIF, se redimensiona y se codifica como JPEG.
export async function prepararParaModelo(buf: Buffer, o: OpcionesImagen = OPCIONES_IMAGEN_DEFECTO): Promise<ImagenPreparada> {
  const meta = await sharp(buf, { failOn: "error" }).metadata();
  if (!meta.width || !meta.height || !meta.format) throw new Error("no se pudo leer la imagen");
  const girada = (meta.orientation ?? 1) >= 5; // 5–8 intercambian ancho y alto
  const ancho = girada ? meta.height : meta.width;
  const alto = girada ? meta.width : meta.height;
  const original: InfoImagen = { ancho, alto, bytes: buf.length, formato: meta.format };
  const escala = escalaParaCaja(ancho, alto, o);
  const rotar = (meta.orientation ?? 1) !== 1;

  if (escala === 1 && !rotar && MEDIA[meta.format] && meta.format !== "gif") {
    return {
      buffer: buf,
      media_type: MEDIA[meta.format]!,
      original,
      enviada: { ...original, redimensionada: false, reencodificada: false },
    };
  }
  const { data, info } = await sharp(buf)
    .rotate()
    .resize({ width: Math.round(ancho * escala), height: Math.round(alto * escala), fit: "fill" })
    .jpeg({ quality: o.calidadJpeg, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  return {
    buffer: data,
    media_type: "image/jpeg",
    original,
    enviada: { ancho: info.width, alto: info.height, bytes: data.length, formato: "jpeg", redimensionada: escala < 1, reencodificada: true },
  };
}

// Nitidez: varianza del Laplaciano en escala de grises, normalizada a 512 px de lado largo
// para que sea comparable entre fotos de distinto tamaño. Más alto = más nítida.
export async function nitidez(buf: Buffer): Promise<number> {
  const { data } = await sharp(buf)
    .rotate()
    .greyscale()
    .resize({ width: 512, height: 512, fit: "inside" })
    .convolve({ width: 3, height: 3, kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0], offset: 128 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  let suma = 0;
  let suma2 = 0;
  for (const v of data) {
    suma += v;
    suma2 += v * v;
  }
  const n = data.length;
  const media = suma / n;
  return Math.round((suma2 / n - media * media) * 10) / 10;
}

// Hash perceptual (dHash 64 bits, hex). Fotos casi idénticas → distancia de Hamming pequeña.
export async function hashPerceptual(buf: Buffer): Promise<string> {
  const { data } = await sharp(buf).rotate().greyscale().resize(9, 8, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  let bits = 0n;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      bits = (bits << 1n) | (data[y * 9 + x]! > data[y * 9 + x + 1]! ? 1n : 0n);
    }
  }
  return bits.toString(16).padStart(16, "0");
}

export function distanciaHamming(a: string, b: string): number {
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let d = 0;
  while (x) {
    d += Number(x & 1n);
    x >>= 1n;
  }
  return d;
}

// Estimación de tokens de imagen de Claude (~ancho×alto/750, tras su propio reescalado a ≤1568 px y ≤1.15 MP).
export function tokensEstimados(ancho: number, alto: number): number {
  let k = Math.min(1, 1568 / Math.max(ancho, alto));
  const px = ancho * k * alto * k;
  if (px > 1_150_000) k *= Math.sqrt(1_150_000 / px);
  return Math.round((ancho * k * alto * k) / 750);
}
