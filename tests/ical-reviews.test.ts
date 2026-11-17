import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCalendar, escapeText, foldLine } from "../src/utils/ical.ts";
import { reviewDays } from "../src/utils/review-plan.ts";

test("escapeText escapa barra, ponto e vírgula, vírgula e quebras de linha", () => {
  assert.equal(escapeText("a\\b;c,d\ne\r\nf"), "a\\\\b\\;c\\,d\\ne\\nf");
});

test("foldLine dobra em 75 octetos sem partir caracteres UTF-8", () => {
  const line = "SUMMARY:" + "ção—😀".repeat(40);
  const folded = foldLine(line);
  const parts = folded.split("\r\n");
  assert.ok(parts.length > 1);
  parts.forEach((p, i) => {
    assert.ok(Buffer.byteLength(p) <= 75, `linha ${i} com ${Buffer.byteLength(p)} octetos`);
    if (i > 0) assert.ok(p.startsWith(" "));
    assert.ok(!p.includes("�"));
  });
  assert.equal(parts.map((p, i) => (i ? p.slice(1) : p)).join(""), line);
  assert.equal(foldLine("curta"), "curta");
});

test("buildCalendar gera CRLF, envelope e eventos de dia inteiro", () => {
  const ics = buildCalendar(
    [{ uid: "task-1@planejar.me", day: "2026-12-31", summary: "Entregar, revisar; fim" }],
    new Date("2026-11-18T12:00:00Z"),
  );
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n"));
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  assert.ok(!/[^\r]\n/.test(ics));
  for (const l of ["CALSCALE:GREGORIAN", "X-WR-CALNAME:Planejar.me", "UID:task-1@planejar.me", "DTSTAMP:20261118T120000Z",
    "DTSTART;VALUE=DATE:20261231", "DTEND;VALUE=DATE:20270101", "SUMMARY:Entregar\\, revisar\\; fim"]) {
    assert.ok(ics.includes(`${l}\r\n`), l);
  }
});

test("reviewDays: fronteiras de D-7, D-3 e D-1", () => {
  assert.deepEqual(reviewDays("2026-11-20", "2026-11-18"), ["2026-11-19"]); // prova em 2 dias
  assert.deepEqual(reviewDays("2026-11-26", "2026-11-18"), ["2026-11-19", "2026-11-23", "2026-11-25"]); // em 8 dias
  assert.deepEqual(reviewDays("2026-11-19", "2026-11-18"), ["2026-11-18"]); // amanhã: D-1 = hoje
  assert.deepEqual(reviewDays("2026-11-18", "2026-11-18"), []); // prova hoje
  assert.deepEqual(reviewDays("2026-12-01", "2026-11-24"), ["2026-11-24", "2026-11-28", "2026-11-30"]); // D-7 = hoje
});
