import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calculateAbsenceLimit,
  calculateAbsenceRisk,
  validateAbsenceWorkloadCeiling,
} from "../src/utils/absence-rules.ts";
import {
  CreateDisciplineSchema,
  UpdateDisciplineSchema,
} from "../src/schemas/discipline-schema.ts";

test("RN01: cálculo do limite máximo de faltas com base na carga horária e percentual", () => {
  assert.equal(calculateAbsenceLimit(60), 15);
  assert.equal(calculateAbsenceLimit(80), 20);
  assert.equal(calculateAbsenceLimit(40), 10);
  assert.equal(calculateAbsenceLimit(30), 7);
  assert.equal(calculateAbsenceLimit(75), 18);

  assert.equal(calculateAbsenceLimit(60, 20), 12);
  assert.equal(calculateAbsenceLimit(60, 30), 18);
  assert.equal(calculateAbsenceLimit(80, 10), 8);
  assert.equal(calculateAbsenceLimit(45, 20), 9);
  assert.equal(calculateAbsenceLimit(100, 25), 25);

  assert.equal(calculateAbsenceLimit(0), 0);
  assert.equal(calculateAbsenceLimit(-10), 0);
  assert.equal(calculateAbsenceLimit(60, 0), 0);
});

test("RN02: níveis de alerta e categorização de risco de faltas", () => {
  const limit = 10;

  for (const abs of [0, 1, 2, 3, 4, 5]) {
    const risk = calculateAbsenceRisk(abs, limit);
    assert.equal(risk.status, "normal", `Faltas ${abs} deveria ser normal`);
    assert.equal(risk.label, "Normal");
  }

  for (const abs of [6, 7, 8]) {
    const risk = calculateAbsenceRisk(abs, limit);
    assert.equal(risk.status, "attention", `Faltas ${abs} deveria ser attention`);
    assert.equal(risk.label, "Atenção");
  }

  for (const abs of [9, 10]) {
    const risk = calculateAbsenceRisk(abs, limit);
    assert.equal(risk.status, "critical", `Faltas ${abs} deveria ser critical`);
    assert.equal(risk.label, "Crítico");
  }

  const reprovado = calculateAbsenceRisk(11, limit);
  assert.equal(reprovado.status, "critical");
  assert.equal(reprovado.label, "Reprovado por falta");

  assert.equal(calculateAbsenceRisk(0, 0).status, "normal");
  assert.equal(calculateAbsenceRisk(1, 0).status, "critical");
});

test("RN02: teste com disciplina de 60h e limite padrão de 15 faltas", () => {
  const limit = 15;

  assert.equal(calculateAbsenceRisk(0, limit).status, "normal");
  assert.equal(calculateAbsenceRisk(8, limit).status, "normal");

  assert.equal(calculateAbsenceRisk(9, limit).status, "attention");
  assert.equal(calculateAbsenceRisk(13, limit).status, "attention");

  assert.equal(calculateAbsenceRisk(14, limit).status, "critical");
  assert.equal(calculateAbsenceRisk(15, limit).status, "critical");

  assert.equal(calculateAbsenceRisk(16, limit).status, "critical");
  assert.equal(calculateAbsenceRisk(16, limit).label, "Reprovado por falta");
});

test("RN03: simulação de registro, consulta e reversão idempotente de faltas", () => {
  let absences = 3;
  const history: Record<string, boolean> = {};

  function recordAbsence(date: string) {
    if (history[date] === false) return;
    if (history[date] === true) {
      absences += 1;
    } else {
      absences += 1;
    }
    history[date] = false;
  }

  function undoAbsence(date: string) {
    if (history[date] === true) return;
    if (history[date] === false) {
      absences = Math.max(0, absences - 1);
      history[date] = true;
    }
  }

  recordAbsence("2026-10-14");
  assert.equal(absences, 4);
  assert.equal(history["2026-10-14"], false);

  recordAbsence("2026-10-14");
  assert.equal(absences, 4);

  undoAbsence("2026-10-14");
  assert.equal(absences, 3);
  assert.equal(history["2026-10-14"], true);

  undoAbsence("2026-10-14");
  assert.equal(absences, 3);
});

test("RN04: trava de carga horária excedida impede que faltas superem a carga horária", () => {
  assert.equal(validateAbsenceWorkloadCeiling(60, 60), true);
  assert.equal(validateAbsenceWorkloadCeiling(0, 60), true);
  assert.equal(validateAbsenceWorkloadCeiling(61, 60), false);
  assert.equal(validateAbsenceWorkloadCeiling(100, 60), false);
  assert.equal(validateAbsenceWorkloadCeiling(-1, 60), false);

  const validCreate = {
    name: "Estrutura de Dados",
    workloadHours: 60,
    userId: "user-1",
    absences: 15,
  };
  assert.equal(CreateDisciplineSchema.safeParse(validCreate).success, true);

  const maxValidCreate = {
    name: "Estrutura de Dados",
    workloadHours: 60,
    userId: "user-1",
    absences: 60,
  };
  assert.equal(CreateDisciplineSchema.safeParse(maxValidCreate).success, true);

  const exceedingCreate = {
    name: "Estrutura de Dados",
    workloadHours: 60,
    userId: "user-1",
    absences: 61,
  };
  const createResult = CreateDisciplineSchema.safeParse(exceedingCreate);
  assert.equal(createResult.success, false);

  const validUpdate = {
    workloadHours: 60,
    absences: 60,
  };
  assert.equal(UpdateDisciplineSchema.safeParse(validUpdate).success, true);

  const exceedingUpdate = {
    workloadHours: 60,
    absences: 61,
  };
  assert.equal(UpdateDisciplineSchema.safeParse(exceedingUpdate).success, false);

  assert.equal(UpdateDisciplineSchema.safeParse({ absences: 5 }).success, true);
});

test("RN01 e RN02: bordas de cálculo e transições exatas", () => {
  assert.equal(calculateAbsenceLimit(0, 25), 0);
  assert.equal(calculateAbsenceLimit(100, 0), 0);
  assert.equal(calculateAbsenceLimit(-50, 25), 0);
  assert.equal(calculateAbsenceLimit(60, -10), 15);
  assert.equal(calculateAbsenceLimit(NaN, 25), 0);
  assert.equal(calculateAbsenceLimit(60, NaN), 15);

  const limit = 100;
  assert.equal(calculateAbsenceRisk(59, limit).status, "normal");
  assert.equal(calculateAbsenceRisk(60, limit).status, "attention");
  assert.equal(calculateAbsenceRisk(89, limit).status, "attention");
  assert.equal(calculateAbsenceRisk(90, limit).status, "critical");
  assert.equal(calculateAbsenceRisk(100, limit).status, "critical");
  assert.equal(calculateAbsenceRisk(101, limit).status, "critical");
  assert.equal(calculateAbsenceRisk(101, limit).label, "Reprovado por falta");

  assert.equal(calculateAbsenceRisk(0, 0).status, "normal");
  assert.equal(calculateAbsenceRisk(0, 0).label, "Normal");
  assert.equal(calculateAbsenceRisk(1, 0).status, "critical");
  assert.equal(calculateAbsenceRisk(1, 0).label, "Reprovado por falta");
});

test(
  "RN03 e RN04: persistência real no banco, idempotência de faltas e trava de carga horária",
  { skip: process.env.RUN_DB_TESTS !== "1" },
  async () => {
    const { randomUUID } = await import("node:crypto");
    const { prisma } = await import("../lib/prisma.ts");
    const { SetAttendanceService } = await import("../src/services/attendance-service.ts");
    const {
      CreateDisciplineService,
      UpdateDisciplineService,
    } = await import("../src/services/discipline-service.ts");
    const { GetUserDashboardService } = await import("../src/services/user/get-user-dashboard.ts");
    const { brasiliaDate, scheduledClassCount } = await import("../src/utils/academic-date.ts");

    const today = brasiliaDate();
    const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();

    const user = await prisma.user.create({
      data: {
        name: "Teste Faltas RN",
        email: `absences-${randomUUID()}@example.invalid`,
        passwordHash: "dummy-hash",
        maxAbsencePct: 25,
      },
    });

    const semesterStart = new Date(`${today}T00:00:00Z`);
    semesterStart.setUTCDate(semesterStart.getUTCDate() - 5 * 7);
    const semesterEnd = new Date(`${today}T00:00:00Z`);
    semesterEnd.setUTCMonth(semesterEnd.getUTCMonth() + 3);
    await prisma.semester.create({
      data: {
        name: "2026.2",
        isCurrent: true,
        userId: user.id,
        startDate: semesterStart,
        endDate: semesterEnd,
      },
    });

    try {
      await assert.rejects(
        () =>
          CreateDisciplineService({
            name: "Inválida",
            workloadHours: 40,
            userId: user.id,
            absences: 41,
          }),
        { message: "O número de faltas não pode ultrapassar a carga horária total." }
      );

      const discipline = await CreateDisciplineService({
        name: "Algoritmos e Estruturas",
        workloadHours: 60,
        userId: user.id,
        days: [weekday],
        absences: 2,
      });
      assert.equal(discipline.workloadHours, 60);
      assert.equal(discipline.absences, 2);
      assert.equal(discipline.schedules.length, 1);
      const schedule = discipline.schedules[0];

      const expectedScheduleAbsences = scheduledClassCount(semesterStart, today, weekday);
      assert.equal(expectedScheduleAbsences, 6);

      let dashboard = await GetUserDashboardService(user.id);
      assert.ok(dashboard);
      const discDashboard = dashboard.disciplines[0];
      assert.equal(discDashboard.manualAbsences, 2);
      assert.equal(discDashboard.scheduleAbsences, expectedScheduleAbsences);
      assert.equal(discDashboard.absences, 2 + expectedScheduleAbsences);

      const firstSet = await SetAttendanceService(user.id, schedule.id, false, today);
      assert.equal(firstSet.attended, false);

      const secondSet = await SetAttendanceService(user.id, schedule.id, false, today);
      assert.equal(secondSet.attended, false);

      dashboard = await GetUserDashboardService(user.id);
      assert.equal(dashboard?.disciplines[0].absences, 2 + expectedScheduleAbsences);

      const presenceSet = await SetAttendanceService(user.id, schedule.id, true, today);
      assert.equal(presenceSet.attended, true);

      await SetAttendanceService(user.id, schedule.id, true, today);

      dashboard = await GetUserDashboardService(user.id);
      assert.equal(dashboard?.disciplines[0].absences, 1 + expectedScheduleAbsences);

      dashboard = await GetUserDashboardService(user.id);
      const currentScheduled = dashboard?.disciplines[0].scheduleAbsences ?? 0;
      const manualCeiling = discipline.workloadHours - currentScheduled;
      await UpdateDisciplineService(discipline.id, { absences: manualCeiling });
      dashboard = await GetUserDashboardService(user.id);
      assert.equal(dashboard?.disciplines[0].absences, discipline.workloadHours);

      await assert.rejects(
        () => UpdateDisciplineService(discipline.id, { absences: manualCeiling + 1 }),
        { message: "O número de faltas não pode ultrapassar a carga horária total." }
      );

      await assert.rejects(
        () => UpdateDisciplineService(discipline.id, { absences: -1 }),
        { message: "O número de faltas não pode ser negativo." }
      );

      await SetAttendanceService(user.id, schedule.id, true, today);
      await assert.rejects(
        () => SetAttendanceService(user.id, schedule.id, false, today),
        { message: "O número de faltas não pode ultrapassar a carga horária total da disciplina." }
      );
    } finally {
      await prisma.user.delete({ where: { id: user.id } });
    }
  }
);
