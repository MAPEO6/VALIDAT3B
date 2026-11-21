import "dotenv/config";

const {
  FOUNDRY_API_KEY,
  FOUNDRY_ENDPOINT,
  FOUNDRY_MODEL = "claude-haiku-5-5",
} = process.env;

if (!FOUNDRY_API_KEY || !FOUNDRY_ENDPOINT) {
  throw new Error(
    "Faltan FOUNDRY_API_KEY o FOUNDRY_ENDPOINT en el .env de la raíz",
  );
}

export type ContentBlock =
  | { type: "text"; text: string }
  | {
      type: "image";
      source: { type: "base64"; media_type: string; data: string };
    };

export async function callModel(
  system: string,
  content: ContentBlock[],
  maxTokens = 700,
) {
  const res = await fetch(`${FOUNDRY_ENDPOINT}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": FOUNDRY_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: FOUNDRY_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content }],
    }),
  });
  if (!res.ok) throw new Error(`Foundry ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data.content
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("");
  return {
    text,
    usage: data.usage as { input_tokens: number; output_tokens: number },
  };
}
