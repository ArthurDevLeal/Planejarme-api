import "dotenv/config";

const RESEND_URL = "https://api.resend.com/emails";
const EMAIL_FROM = process.env.EMAIL_FROM || "Planejar.me <onboarding@resend.dev>";

type EmailInput = { to: string; subject: string; html: string; text: string };

export async function SendEmail({ to, subject, html, text }: EmailInput) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV === "production") throw new Error("RESEND_API_KEY não configurada");
    console.info(`[email:dev] Para ${to} | ${subject}\n${text}`);
    return;
  }

  const response = await fetch(RESEND_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: EMAIL_FROM, to: [to], subject, html, text }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Resend respondeu ${response.status}: ${detail.slice(0, 300)}`);
  }
}
