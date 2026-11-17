import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderEmail } from "../src/lib/email-layout.ts";
import { digestItems, firstName, isMondayInBrasilia, trialWindow, weeklyUsersWhere } from "../src/services/lifecycle-email-service.ts";

const inWindow = (w: { gt: Date; lte: Date }, d: Date) => d > w.gt && d <= w.lte;

describe("renderEmail", () => {
  const out = renderEmail({
    greetingName: "Ana <b>",
    paragraphs: ["Oi &amp; tchau"],
    list: ["Item 1", "Item 2"],
    cta: { label: "Abrir", url: "https://x.test/a?b=1&c=2" },
    footer: "Rodapé",
  });
  it("escapa nome e url no html", () => {
    assert.ok(out.html.includes("Olá, Ana &#60;b&#62;."));
    assert.ok(out.html.includes('href="https://x.test/a?b=1&#38;c=2"'));
    assert.ok(!out.html.includes("<b>"));
  });
  it("monta o texto puro com lista e link", () => {
    assert.ok(out.text.includes("Olá, Ana <b>."));
    assert.ok(out.text.includes("Oi & tchau"));
    assert.ok(out.text.includes("- Item 1\n- Item 2"));
    assert.ok(out.text.includes("Abrir: https://x.test/a?b=1&c=2"));
  });
});

describe("trialWindow", () => {
  const now = new Date("2026-11-17T12:00:00Z");
  const h = (n: number) => new Date(now.getTime() + n * 3_600_000);
  it("ending: (agora+24h, agora+48h]", () => {
    const w = trialWindow("ending", now);
    assert.equal(inWindow(w, h(24)), false);
    assert.equal(inWindow(w, h(24.01)), true);
    assert.equal(inWindow(w, h(48)), true);
    assert.equal(inWindow(w, h(48.01)), false);
  });
  it("ended: (agora-24h, agora]", () => {
    const w = trialWindow("ended", now);
    assert.equal(inWindow(w, h(-24)), false);
    assert.equal(inWindow(w, h(-23.99)), true);
    assert.equal(inWindow(w, now), true);
    assert.equal(inWindow(w, h(0.01)), false);
  });
});

describe("resumo semanal", () => {
  it("segunda-feira em Brasília", () => {
    assert.equal(isMondayInBrasilia(new Date("2026-11-16T13:00:00Z")), true); // seg 10h
    assert.equal(isMondayInBrasilia(new Date("2026-11-17T01:00:00Z")), true); // seg 22h
    assert.equal(isMondayInBrasilia(new Date("2026-11-17T03:00:00Z")), false); // ter 00h
  });
  it("domingo 23h em Brasília ainda não é segunda", () => {
    assert.equal(isMondayInBrasilia(new Date("2026-11-16T02:00:00Z")), false); // dom 23h
  });
  it("ordena, limita a 10, formata dd/mm e escapa", () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({ date: new Date(Date.UTC(2026, 10, 30 - i, 15)), label: i === 0 ? "<script>" : `T${i}` }));
    const items = digestItems(rows);
    assert.equal(items.length, 10);
    assert.equal(items[0], "19/11 - T11");
    assert.equal(items[9], "28/11 - T2");
    assert.ok(digestItems([rows[0]])[0].includes("&#60;script&#62;"));
  });
});

describe("firstName e weeklyUsersWhere", () => {
  it("firstName ignora espaços e vazio vira undefined", () => {
    assert.equal(firstName("  Ana   Maria "), "Ana");
    assert.equal(firstName("   "), undefined);
  });
  it("weeklyUsersWhere filtra quem tem algo na janela", () => {
    const range = { gte: new Date("2026-11-16T03:00:00Z"), lt: new Date("2026-11-23T03:00:00Z") };
    const where = weeklyUsersWhere(range, ["u1"]);
    assert.equal(where.weeklyEmails, true);
    assert.deepEqual(where.id, { in: ["u1"] });
    assert.equal(where.OR.length, 2);
    assert.deepEqual(where.OR[0].tasks?.some?.dueDate, range);
    assert.equal(where.OR[1].disciplines?.some?.evaluations.some.score, null);
    assert.equal("id" in weeklyUsersWhere(range), false);
  });
});
