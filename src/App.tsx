import { useState } from "react";
import { validar } from "./api";

export default function App() {
  const [fotos, setFotos] = useState<
    Partial<Record<"fachada" | "producto" | "etiqueta", File>>
  >({});
  const [captureId, setCaptureId] = useState("CAP-000123");
  const [barras, setBarras] = useState("");
  const [esperado, setEsperado] = useState("");
  const [out, setOut] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  const listo = fotos.fachada && fotos.producto && fotos.etiqueta;

  async function enviar() {
    setLoading(true);
    try {
      setOut(
        await validar(
          {
            capture_id: captureId,
            codigo_barras: barras,
            producto_esperado: esperado,
          },
          fotos as Required<typeof fotos>,
        ),
      );
    } catch (e) {
      setOut({ error: String(e) });
    }
    setLoading(false);
  }

  return (
    <main style={{ maxWidth: 720, margin: "2rem auto", textAlign: "left" }}>
      <h1>Validat3B</h1>
      <input
        value={captureId}
        onChange={(e) => setCaptureId(e.target.value)}
        placeholder="capture_id"
      />
      <input
        value={barras}
        onChange={(e) => setBarras(e.target.value)}
        placeholder="Código de barras"
      />
      <input
        value={esperado}
        onChange={(e) => setEsperado(e.target.value)}
        placeholder="Producto esperado"
      />
      {(["fachada", "producto", "etiqueta"] as const).map((k) => (
        <label key={k} style={{ display: "block", margin: ".5rem 0" }}>
          {k}:{" "}
          <input
            type="file"
            accept="image/*"
            onChange={(e) =>
              setFotos((f) => ({ ...f, [k]: e.target.files?.[0] }))
            }
          />
        </label>
      ))}
      <button disabled={!listo || loading} onClick={enviar}>
        {loading ? "Analizando…" : "Validar"}
      </button>
      <pre>{out ? JSON.stringify(out, null, 2) : ""}</pre>
    </main>
  );
}
