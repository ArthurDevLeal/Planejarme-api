export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

type EmailParts = {
  preheader?: string;
  /** Texto puro; é escapado aqui. */
  greetingName?: string;
  /** HTML já escapado. */
  paragraphs: string[];
  cta?: { label: string; url: string };
  /** HTML já escapado. */
  list?: string[];
  /** HTML já escapado. */
  footer: string;
};

const stripTags = (html: string) =>
  html
    .replace(/<br\s*\/?>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");

/** Layout dos e-mails novos, no mesmo visual do e-mail de redefinição de senha. */
export function renderEmail({ preheader, greetingName, paragraphs, cta, list, footer }: EmailParts) {
  const html = [
    preheader ? `<div style="display:none;max-height:0;overflow:hidden">${escapeHtml(preheader)}</div>` : "",
    greetingName ? `<p>Olá, ${escapeHtml(greetingName)}.</p>` : "",
    ...paragraphs.map((item) => `<p>${item}</p>`),
    list?.length ? `<ul>${list.map((item) => `<li>${item}</li>`).join("")}</ul>` : "",
    cta ? `<p><a href="${escapeHtml(cta.url)}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#2563eb;color:#fff;text-decoration:none">${escapeHtml(cta.label)}</a></p>` : "",
    `<p style="color:#64748b;font-size:12px">${footer}</p>`,
  ].join("");
  const text = [
    greetingName ? `Olá, ${greetingName}.` : "",
    ...paragraphs.map(stripTags),
    list?.length ? list.map((item) => `- ${stripTags(item)}`).join("\n") : "",
    cta ? `${cta.label}: ${cta.url}` : "",
    stripTags(footer),
  ].filter(Boolean).join("\n\n");
  return { html, text };
}
