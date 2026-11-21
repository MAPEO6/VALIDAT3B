// Lector CSV mínimo (RFC 4180): comillas dobles, comas y saltos de línea dentro de campos, BOM y CRLF.
export function parseCsv(texto: string): Record<string, string>[] {
  const src = texto.replace(/^﻿/, "");
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = "";
  let enComillas = false;

  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (enComillas) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          campo += '"';
          i++;
        } else enComillas = false;
      } else campo += c;
    } else if (c === '"') enComillas = true;
    else if (c === ",") {
      fila.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      fila.push(campo);
      campo = "";
      filas.push(fila);
      fila = [];
    } else campo += c;
  }
  if (campo !== "" || fila.length > 0) {
    fila.push(campo);
    filas.push(fila);
  }

  const [encabezado, ...datos] = filas.filter((f) => !(f.length === 1 && f[0] === ""));
  if (!encabezado) return [];
  return datos.map((f) => Object.fromEntries(encabezado.map((h, i) => [h.trim(), f[i] ?? ""])));
}
