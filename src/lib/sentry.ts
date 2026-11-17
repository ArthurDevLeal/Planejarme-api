import "dotenv/config";
import * as Sentry from "@sentry/node";

/** Nada de request nem usuário: headers, cookies, corpo e query (ex.: segredo do webhook) não podem sair daqui. */
export function beforeSend<T extends Sentry.ErrorEvent>(event: T): T {
  delete event.request;
  delete event.user;
  return event;
}

// Sem SENTRY_DSN o SDK nunca inicia e captureException/flush viram no-op.
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    // No v11 o padrão coleta PII (cookies, headers, corpo, query, variáveis de stack); desliga tudo.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
    },
    beforeSend,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  });
}

/** Envia o erro e espera o envio: na Vercel a função congela depois da resposta. */
export async function reportError(error: unknown) {
  if (!process.env.SENTRY_DSN) return;
  try {
    Sentry.captureException(error);
    await Sentry.flush(1000);
  } catch (e) {
    console.error("[sentry]", e);
  }
}
