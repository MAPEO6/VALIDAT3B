// Cliente de Azure AI Foundry (endpoint compatible con la API de mensajes de Anthropic).
// Reintenta solo errores transitorios (red, timeout, 408, 429, 5xx). Nunca lanza sin un mensaje claro.

export type ContentBlock =
  | { type: "text"; text: string }
  | {
      type: "image";
      source: { type: "base64"; media_type: string; data: string };
    };

export interface Usage {
  input_tokens: number;
  output_tokens: number;
}

export interface OpcionesFoundry {
  apiKey: string;
  endpoint: string; // ej. https://<recurso>.services.ai.azure.com/anthropic
  model: string;
  timeoutMs?: number;
  reintentos?: number; // reintentos ante errores transitorios
  esperaBaseMs?: number;
  fetchImpl?: typeof fetch; // inyectable en pruebas
}

export interface LlamadaModelo {
  system: string;
  content: ContentBlock[];
  maxTokens: number;
}

export interface RespuestaModelo {
  text: string;
  usage: Usage;
  stop_reason: string | null;
  intentos: number;
}

export class FoundryError extends Error {
  status: number | null;
  transitorio: boolean;
  constructor(message: string, status: number | null, transitorio: boolean) {
    super(message);
    this.status = status;
    this.transitorio = transitorio;
  }
}

const esTransitorio = (status: number) =>
  status === 408 || status === 429 || status >= 500;
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function urlMensajes(endpoint: string): string {
  const base = endpoint.trim().replace(/\/+$/, "");
  return base.endsWith("/v1/messages") ? base : `${base}/v1/messages`;
}

export async function llamarModelo(
  opts: OpcionesFoundry,
  llamada: LlamadaModelo,
): Promise<RespuestaModelo> {
  const f = opts.fetchImpl ?? fetch;
  const reintentos = opts.reintentos ?? 2;
  const esperaBase = opts.esperaBaseMs ?? 1000;
  let ultimoError: FoundryError | null = null;

  for (let intento = 1; intento <= reintentos + 1; intento++) {
    try {
      const res = await f(urlMensajes(opts.endpoint), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          // Se envían ambas: el endpoint Anthropic de Foundry acepta `x-api-key`; Azure usa `api-key`.
          "x-api-key": opts.apiKey,
          "api-key": opts.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: opts.model,
          max_tokens: llamada.maxTokens,
          system: llamada.system,
          messages: [{ role: "user", content: llamada.content }],
        }),
        signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
      });
      if (!res.ok) {
        const cuerpo = (await res.text()).slice(0, 300);
        throw new FoundryError(
          `Foundry ${res.status}: ${cuerpo}`,
          res.status,
          esTransitorio(res.status),
        );
      }
      const data = (await res.json()) as {
        content?: { type: string; text?: string }[];
        usage?: Partial<Usage>;
        stop_reason?: string | null;
      };
      return {
        text: (data.content ?? [])
          .filter((b) => b.type === "text")
          .map((b) => b.text ?? "")
          .join(""),
        usage: {
          input_tokens: data.usage?.input_tokens ?? 0,
          output_tokens: data.usage?.output_tokens ?? 0,
        },
        stop_reason: data.stop_reason ?? null,
        intentos: intento,
      };
    } catch (e) {
      if (e instanceof FoundryError) ultimoError = e;
      else {
        const nombre = (e as Error).name;
        const msg =
          nombre === "TimeoutError" || nombre === "AbortError"
            ? "tiempo de espera agotado"
            : (e as Error).message;
        ultimoError = new FoundryError(
          `Foundry sin respuesta: ${msg}`,
          null,
          true,
        );
      }
      if (!ultimoError.transitorio || intento > reintentos) break;
      await dormir(esperaBase * 2 ** (intento - 1));
    }
  }
  throw (
    ultimoError ?? new FoundryError("Foundry: error desconocido", null, false)
  );
}
