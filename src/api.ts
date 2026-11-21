async function reducir(file: File, max = 1024): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = bmp.width * k;
  c.height = bmp.height * k;
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((ok) => c.toBlob((b) => ok(b!), "image/jpeg", 0.85));
}

export async function validar(
  meta: Record<string, unknown>,
  fotos: { fachada: File; producto: File; etiqueta: File },
) {
  const fd = new FormData();
  fd.append("meta", JSON.stringify(meta));
  for (const [k, f] of Object.entries(fotos))
    fd.append(k, await reducir(f), `${k}.jpg`);
  const r = await fetch("/api/validar", { method: "POST", body: fd });
  if (!r.ok) throw new Error((await r.json()).error ?? "Error");
  return r.json();
}
