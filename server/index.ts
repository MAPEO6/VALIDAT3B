import express from "express";
import multer from "multer";
import { callModel, type ContentBlock } from "./foundry.ts";
import { SYSTEM_PROMPT, buildUserText, aplicarGuardas } from "./criterios.ts";

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

const toBlock = (f: Express.Multer.File): ContentBlock => ({
  type: "image",
  source: {
    type: "base64",
    media_type: f.mimetype,
    data: f.buffer.toString("base64"),
  },
});

app.post(
  "/api/validar",
  upload.fields([
    { name: "fachada", maxCount: 1 },
    { name: "producto", maxCount: 1 },
    { name: "etiqueta", maxCount: 1 },
  ]),
  async (req, res) => {
    const files = req.files as Record<string, Express.Multer.File[]>;
    const meta = JSON.parse(req.body.meta ?? "{}");
    if (!files.fachada || !files.producto || !files.etiqueta) {
      return res.status(400).json({
        error: "Se requieren las 3 imágenes: fachada, producto y etiqueta",
      });
    }
    try {
      const { text, usage } = await callModel(SYSTEM_PROMPT, [
        toBlock(files.fachada[0]),
        toBlock(files.producto[0]),
        toBlock(files.etiqueta[0]),
        { type: "text", text: buildUserText(meta) },
      ]);
      const json = JSON.parse(
        text
          .trim()
          .replace(/^```json|```$/g, "")
          .trim(),
      );
      json.capture_id = meta.capture_id ?? json.capture_id;
      res.json({ resultado: aplicarGuardas(json), usage });
    } catch (e) {
      // Fallo técnico → revisión manual (cuesta 1, no 10)
      res.json({
        resultado: {
          capture_id: meta.capture_id ?? null,
          decision: "revision_manual",
          confidence_score: 0,
          reason_code: null,
          validaciones: {},
          precio_detectado: null,
          codigo_barras_detectado: null,
          explicacion: `Error de procesamiento: ${(e as Error).message}`,
        },
      });
    }
  },
);

app.listen(Number(process.env.PORT ?? 3001), () => console.log("API lista"));
