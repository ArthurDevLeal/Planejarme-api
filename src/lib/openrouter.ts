// OpenRouter: o dono troca o modelo por OPENROUTER_MODEL sem deploy de código. Padrão barato e com suporte a json_schema.
// Grátis e com saída em JSON schema; testado em 2026-11-16 (10 questões boas em ~70 s). Trocar por OPENROUTER_MODEL.
export const DEFAULT_QUIZ_MODEL = "nvidia/nemotron-3.5-super-vl:free";
export const openRouterModelId = () => process.env.OPENROUTER_MODEL?.trim() || DEFAULT_QUIZ_MODEL;

type OpenRouterResponse = {
  model?: string;
  choices?: { finish_reason?: string | null; message?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

export type OpenRouterCall = { system: string; user: string; schemaName: string; jsonSchema: Record<string, unknown>; maxTokens?: number };
/** `content` é null quando a resposta não é aproveitável (cortada por tamanho, filtrada, vazia). */
export type OpenRouterResult = { content: string | null; model: string; inputTokens: number; outputTokens: number };

export async function callOpenRouter({ system, user, schemaName, jsonSchema, maxTokens = 32000 }: OpenRouterCall): Promise<OpenRouterResult> {
  const model = openRouterModelId();
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      ...(process.env.WEB_URL ? { "HTTP-Referer": process.env.WEB_URL } : {}),
      "X-Title": "Planejar.me",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      // Raciocínio desligado: no nível avançado o modelo gastava quase todo o limite pensando e o JSON saía cortado.
      // Questões a partir de um texto dado não precisam dele. Modelo sem raciocínio ignora.
      reasoning: { enabled: false },
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      response_format: { type: "json_schema", json_schema: { name: schemaName, strict: true, schema: jsonSchema } },
    }),
    // Modelos grátis da OpenRouter podem levar mais de 1 min; a função na Vercel (Fluid) aguenta até 300 s.
    signal: AbortSignal.timeout(Number(process.env.OPENROUTER_TIMEOUT_MS) || 240_000),
  });
  if (!response.ok) throw new Error(`OpenRouter respondeu ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const body = (await response.json()) as OpenRouterResponse;
  const choice = body.choices?.[0];
  const usage = { model: body.model ?? model, inputTokens: body.usage?.prompt_tokens ?? 0, outputTokens: body.usage?.completion_tokens ?? 0 };
  // "length" corta o JSON no meio; "content_filter"/"error" não têm conteúdo.
  if (choice?.finish_reason !== "stop" || !choice.message?.content) return { content: null, ...usage };
  return { content: choice.message.content, ...usage };
}
