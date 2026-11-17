export type IcalEvent = {
  uid: string;
  /** YYYY-MM-DD: evento de dia inteiro. */
  day: string;
  summary: string;
  description?: string;
};

export function escapeText(value: string): string {
  return value.replace(/[\x00-\x08\x0B-\x1F\x7F]/g, "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n");
}

/** Dobra em 75 octetos (RFC 5545, 3.1) sem nunca partir um caractere UTF-8; a continuação começa com um espaço. */
export function foldLine(line: string): string {
  const parts: string[] = [];
  let current = "";
  let size = 0;
  for (const ch of line) {
    const bytes = Buffer.byteLength(ch);
    const limit = parts.length === 0 ? 75 : 74; // o espaço inicial da continuação conta
    if (size + bytes > limit) {
      parts.push(current);
      current = "";
      size = 0;
    }
    current += ch;
    size += bytes;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

const compact = (day: string) => day.replace(/-/g, "");
const nextDay = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

export function buildCalendar(events: IcalEvent[], now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Planejar.me//Calendario//PT",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Planejar.me",
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    "X-PUBLISHED-TTL:PT6H",
  ];
  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compact(e.day)}`,
      `DTEND;VALUE=DATE:${compact(nextDay(e.day))}`,
      `SUMMARY:${escapeText(e.summary)}`,
    );
    if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
