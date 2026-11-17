import "dotenv/config";
import * as Sentry from "@sentry/node";

// Sem SENTRY_DSN o SDK nunca inicia e captureException/flush viram no-op.
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    // v11 removeu sendDefaultPii: o SDK já não envia PII por padrão.
    tracesSampleRate: 0.1,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  });
}

/** Envia o erro e espera o envio: na Vercel a função congela depois da resposta. */
export async function reportError(error: unknown) {
  if (!process.env.SENTRY_DSN) return;
  try {
    Sentry.captureException(error);
    await Sentry.flush(2000);
  } catch (e) {
    console.error("[sentry]", e);
  }
}
