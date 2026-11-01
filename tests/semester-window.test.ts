import assert from "node:assert/strict";
import { test } from "node:test";
import {
  attendanceWindowEnd,
  courseWindow,
  effectiveAttendanceStart,
  scheduleAbsences,
} from "../src/utils/academic-date.ts";

const WINDOW = { startDate: "2026-08-01", endDate: "2026-12-20" };

test("início da contagem usa a data do semestre quando ela é posterior ao horário", () => {
  const scheduleSince = new Date("2026-07-01T00:00:00Z");
  assert.equal(
    effectiveAttendanceStart(scheduleSince, WINDOW).toISOString().slice(0, 10),
    "2026-08-01",
  );
});

test("início da contagem preserva o marco do horário quando ele é posterior ao semestre", () => {
  const scheduleSince = new Date("2026-09-10T00:00:00Z");
  assert.equal(
    effectiveAttendanceStart(scheduleSince, WINDOW).toISOString().slice(0, 10),
    "2026-09-10",
  );
});

test("sem período letivo definido, mantém o teto antigo de 15 semanas", () => {
  const schedule = { attendanceSince: new Date("2026-10-04T00:00:00Z"), dayOfWeek: 0, attendances: [] };
  assert.equal(scheduleAbsences(schedule, "2027-02-01"), 15);
});

test("com semestre definido, a contagem termina na data de término do semestre", () => {
  const schedule = { attendanceSince: new Date("2026-08-02T00:00:00Z"), dayOfWeek: 0, attendances: [] };
  // 2026-08-02 é domingo. De 02/08 até 20/12/2026 são 21 domingos.
  assert.equal(scheduleAbsences(schedule, "2027-02-01", WINDOW), 21);
});

test("período letivo futuro não gera faltas retroativas", () => {
  const future = { startDate: "2027-02-01", endDate: "2027-06-30" };
  const schedule = { attendanceSince: new Date("2026-10-04T00:00:00Z"), dayOfWeek: 0, attendances: [] };
  assert.equal(scheduleAbsences(schedule, "2026-10-19", future), 0);
});

test("presenças fora do período letivo não reduzem faltas", () => {
  const schedule = {
    attendanceSince: new Date("2026-08-02T00:00:00Z"),
    dayOfWeek: 0,
    attendances: [
      { date: new Date("2026-07-26T00:00:00Z"), attended: true }, // antes do semestre: ignorada
      { date: new Date("2026-08-09T00:00:00Z"), attended: true }, // dentro: válida
    ],
  };
  // Domingos contados de 02/08 até 19/08: 02/08, 09/08 e 16/08 (3 aulas).
  // Somente a presença de 09/08 abate, então 3 - 1 = 2 faltas.
  assert.equal(scheduleAbsences(schedule, "2026-08-19", WINDOW), 2);
});

test("fim da contagem nunca ultrapassa hoje", () => {
  const since = new Date("2026-08-01T00:00:00Z");
  assert.equal(
    attendanceWindowEnd(since, "2026-08-15", WINDOW),
    Date.parse("2026-08-15T00:00:00Z"),
  );
});

test("courseWindow converte datas do semestre e ignora semestre incompleto", () => {
  assert.deepEqual(
    courseWindow({ startDate: new Date("2026-08-01T00:00:00Z"), endDate: new Date("2026-12-20T00:00:00Z") }),
    WINDOW,
  );
  assert.equal(courseWindow(null), undefined);
  assert.equal(courseWindow({ startDate: null, endDate: new Date() }), undefined);
});
