import "dotenv/config";
import { PostHog } from "posthog-node";

let client: PostHog | undefined;

/** Evento de negócio no PostHog. Sem POSTHOG_KEY não faz nada; nunca lança. Só ids e props simples, nada de PII. */
export async function track(userId: string, event: string, props?: Record<string, unknown>) {
  const key = process.env.POSTHOG_KEY;
  // Teste nunca envia, mesmo com POSTHOG_KEY no .env (node --test seta NODE_TEST_CONTEXT).
  if (!key || process.env.NODE_ENV === "test" || process.env.NODE_TEST_CONTEXT) return;
  try {
    client ??= new PostHog(key, { host: process.env.POSTHOG_HOST || "https://us.i.posthog.com", requestTimeout: 2000, fetchRetryCount: 0 });
    // captureImmediate envia na hora (serverless não garante flush em background).
    await client.captureImmediate({ distinctId: userId, event, properties: props });
  } catch (error) {
    console.error("[analytics]", error);
  }
}
