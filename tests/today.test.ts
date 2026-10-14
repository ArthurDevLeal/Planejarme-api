import assert from "node:assert/strict";
import { test } from "node:test";
import { brasiliaDate, scheduleAbsences, scheduledClassCount } from "../src/utils/academic-date";

test("contagem semanal inclui hoje, dias não visitados e preserva início da integração", () => {
  const since = new Date("2026-10-12T00:00:00Z");
  assert.equal(scheduledClassCount(since, "2026-10-12", 1), 1);
  assert.equal(scheduledClassCount(since, "2026-10-19", 1), 2);
  assert.equal(scheduledClassCount(since, "2026-10-11", 1), 0);
  assert.equal(scheduledClassCount(since, "2026-10-19", 0), 1);
});
test("presenças reduzem faltas; registros futuros, anteriores e de outro dia não afetam o total", () => {
  const schedule = { attendanceSince: new Date("2026-10-12T00:00:00Z"), dayOfWeek: 1, attendances: [
    { date: new Date("2026-10-12T00:00:00Z"), attended: true },
    { date: new Date("2026-10-19T00:00:00Z"), attended: false },
    { date: new Date("2026-10-26T00:00:00Z"), attended: true },
    { date: new Date("2026-10-05T00:00:00Z"), attended: true },
    { date: new Date("2026-10-13T00:00:00Z"), attended: true },
  ] };
  assert.equal(scheduleAbsences(schedule, "2026-10-19"), 1);
});
test("frequência encerra a contagem no limite de 15 semanas", () => {
  const schedule = { attendanceSince: new Date("2026-10-04T00:00:00Z"), dayOfWeek: 0, attendances: [] };
  assert.equal(scheduleAbsences(schedule, "2027-02-01"), 15);
});
test("data de Brasília independe do fuso do processo", () => {
  assert.equal(brasiliaDate(new Date("2026-10-13T02:59:00Z")), "2026-10-12");
  assert.equal(brasiliaDate(new Date("2026-10-13T03:00:00Z")), "2026-10-13");
});
