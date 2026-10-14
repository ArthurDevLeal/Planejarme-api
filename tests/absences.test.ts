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
  // Padrão 25%
  assert.equal(calculateAbsenceLimit(60), 15);
  assert.equal(calculateAbsenceLimit(80), 20);
  assert.equal(calculateAbsenceLimit(40), 10);
  assert.equal(calculateAbsenceLimit(30), 7); // floor(7.5) = 7
  assert.equal(calculateAbsenceLimit(75), 18); // floor(18.75) = 18

  // Percentual customizado do perfil do usuário
  assert.equal(calculateAbsenceLimit(60, 20), 12);
  assert.equal(calculateAbsenceLimit(60, 30), 18);
  assert.equal(calculateAbsenceLimit(80, 10), 8);
  assert.equal(calculateAbsenceLimit(45, 20), 9);
  assert.equal(calculateAbsenceLimit(100, 25), 25);

  // Casos de borda: zero ou valores negativos
  assert.equal(calculateAbsenceLimit(0), 0);
  assert.equal(calculateAbsenceLimit(-10), 0);
  assert.equal(calculateAbsenceLimit(60, 0), 0);
});

test("RN02: níveis de alerta e categorização de risco de faltas", () => {
  const limit = 10;

  // 🟢 Verde (Normal): abaixo de 60% do limite (< 6 aulas para limite 10)
  for (const abs of [0, 1, 2, 3, 4, 5]) {
    const risk = calculateAbsenceRisk(abs, limit);
    assert.equal(risk.status, "normal", `Faltas ${abs} deveria ser normal`);
    assert.equal(risk.label, "Normal");
  }

  // 🟡 Amarelo (Atenção): entre 60% e 89% do limite (6 a 8 aulas para limite 10)
  for (const abs of [6, 7, 8]) {
    const risk = calculateAbsenceRisk(abs, limit);
    assert.equal(risk.status, "attention", `Faltas ${abs} deveria ser attention`);
    assert.equal(risk.label, "Atenção");
  }

  // 🔴 Vermelho (Crítico): 90% ou mais do limite (9 a 10 aulas para limite 10)
  for (const abs of [9, 10]) {
    const risk = calculateAbsenceRisk(abs, limit);
    assert.equal(risk.status, "critical", `Faltas ${abs} deveria ser critical`);
    assert.equal(risk.label, "Crítico");
  }

  // Aluno reprovado por falta: faltas > limite
  const reprovado = calculateAbsenceRisk(11, limit);
  assert.equal(reprovado.status, "critical");
  assert.equal(reprovado.label, "Reprovado por falta");

  // Limite zero: sem faltas é normal, com falta é reprovado
  assert.equal(calculateAbsenceRisk(0, 0).status, "normal");
  assert.equal(calculateAbsenceRisk(1, 0).status, "critical");
});

test("RN02: teste com disciplina de 60h e limite padrão de 15 faltas", () => {
  const limit = 15; // 60 * 0.25 = 15
  // 60% de 15 = 9. 90% de 15 = 13.5.

  // 0 a 8 faltas: < 60% -> Verde
  assert.equal(calculateAbsenceRisk(0, limit).status, "normal");
  assert.equal(calculateAbsenceRisk(8, limit).status, "normal");

  // 9 a 13 faltas: 60% a 89% -> Amarelo
  assert.equal(calculateAbsenceRisk(9, limit).status, "attention");
  assert.equal(calculateAbsenceRisk(13, limit).status, "attention");

  // 14 a 15 faltas: >= 90% -> Vermelho
  assert.equal(calculateAbsenceRisk(14, limit).status, "critical");
  assert.equal(calculateAbsenceRisk(15, limit).status, "critical");

  // > 15 faltas: Reprovado
  assert.equal(calculateAbsenceRisk(16, limit).status, "critical");
  assert.equal(calculateAbsenceRisk(16, limit).label, "Reprovado por falta");
});

test("RN03: simulação de registro, consulta e reversão idempotente de faltas", () => {
  // Estado inicial de faltas
  let absences = 3;
  const history: Record<string, boolean> = {}; // data -> attended

  // Registrar falta para uma data
  function recordAbsence(date: string) {
    if (history[date] === false) return; // idempotente
    if (history[date] === true) {
      absences += 1;
    } else {
      absences += 1;
    }
    history[date] = false;
  }

  // Desfazer falta para uma data
  function undoAbsence(date: string) {
    if (history[date] === true) return; // idempotente
    if (history[date] === false) {
      absences = Math.max(0, absences - 1);
      history[date] = true;
    }
  }

  // 1. Registra falta no dia 2026-10-14
  recordAbsence("2026-10-14");
  assert.equal(absences, 4);
  assert.equal(history["2026-10-14"], false);

  // 2. Chamada repetida é idempotente
  recordAbsence("2026-10-14");
  assert.equal(absences, 4);

  // 3. Desfazer falta reverte o estado
  undoAbsence("2026-10-14");
  assert.equal(absences, 3);
  assert.equal(history["2026-10-14"], true);

  // 4. Repetição da reversão é idempotente
  undoAbsence("2026-10-14");
  assert.equal(absences, 3);
});

test("RN04: trava de carga horária excedida impede que faltas superem a carga horária", () => {
  assert.equal(validateAbsenceWorkloadCeiling(60, 60), true);
  assert.equal(validateAbsenceWorkloadCeiling(0, 60), true);
  assert.equal(validateAbsenceWorkloadCeiling(61, 60), false);
  assert.equal(validateAbsenceWorkloadCeiling(100, 60), false);
  assert.equal(validateAbsenceWorkloadCeiling(-1, 60), false);

  // Validação no schema de criação (CreateDisciplineSchema)
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

  // Validação no schema de atualização (UpdateDisciplineSchema)
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

  // Update parcial sem workloadHours é aceito sintaticamente (validação semântica no service)
  assert.equal(UpdateDisciplineSchema.safeParse({ absences: 5 }).success, true);
});

test("RN01 e RN02: bordas de cálculo e transições exatas", () => {
  // RN01: limites com valores decimais, zero ou nulos
  assert.equal(calculateAbsenceLimit(0, 25), 0);
  assert.equal(calculateAbsenceLimit(100, 0), 0);
  assert.equal(calculateAbsenceLimit(-50, 25), 0);
  assert.equal(calculateAbsenceLimit(60, -10), 15); // fallback para padrão 25%
  assert.equal(calculateAbsenceLimit(NaN, 25), 0);
  assert.equal(calculateAbsenceLimit(60, NaN), 15); // fallback para padrão 25%

  // RN02: limites e transições exatas de porcentagem
  const limit = 100; // Limite 100 facilita testar porcentagens diretamente
  assert.equal(calculateAbsenceRisk(59, limit).status, "normal");
  assert.equal(calculateAbsenceRisk(60, limit).status, "attention");
  assert.equal(calculateAbsenceRisk(89, limit).status, "attention");
  assert.equal(calculateAbsenceRisk(90, limit).status, "critical");
  assert.equal(calculateAbsenceRisk(100, limit).status, "critical");
  assert.equal(calculateAbsenceRisk(101, limit).status, "critical");
  assert.equal(calculateAbsenceRisk(101, limit).label, "Reprovado por falta");

  // Limite zero
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
    const { brasiliaDate } = await import("../src/utils/academic-date.ts");

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

    try {
      // 1. RN04 no CreateDisciplineService: proibir criação com faltas > carga horária
      assert.throws(
        () =>
          CreateDisciplineService({
            name: "Inválida",
            workloadHours: 40,
            userId: user.id,
            absences: 41,
          }),
        { message: "O número de faltas não pode ultrapassar a carga horária total." }
      );

      // 2. Criar disciplina válida com horário no dia de hoje
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

      // 3. Consultar dashboard: absences deve ser manualAbsences (2) + scheduleAbsences (1) = 3
      let dashboard = await GetUserDashboardService(user.id);
      assert.ok(dashboard);
      const discDashboard = dashboard.disciplines[0];
      assert.equal(discDashboard.manualAbsences, 2);
      assert.equal(discDashboard.scheduleAbsences, 1);
      assert.equal(discDashboard.absences, 3);

      // 4. RN03: Registrar falta para o dia de hoje é idempotente
      const firstSet = await SetAttendanceService(user.id, schedule.id, false, today);
      assert.equal(firstSet.attended, false);

      const secondSet = await SetAttendanceService(user.id, schedule.id, false, today);
      assert.equal(secondSet.attended, false);

      dashboard = await GetUserDashboardService(user.id);
      assert.equal(dashboard?.disciplines[0].absences, 3);

      // 5. RN03: Reverter falta (marcar presença) reduz a contagem de faltas
      const presenceSet = await SetAttendanceService(user.id, schedule.id, true, today);
      assert.equal(presenceSet.attended, true);

      // Idempotência ao marcar presença repetida
      await SetAttendanceService(user.id, schedule.id, true, today);

      dashboard = await GetUserDashboardService(user.id);
      assert.equal(dashboard?.disciplines[0].absences, 2); // 2 manual + 0 schedule

      // 6. RN04 no UpdateDisciplineService: não pode ultrapassar carga horária
      // Carga horária é 60. Schedule absences é 0. Manual até 60 é aceito.
      await UpdateDisciplineService(discipline.id, { absences: 60 });
      dashboard = await GetUserDashboardService(user.id);
      assert.equal(dashboard?.disciplines[0].absences, 60);

      // Tentar atualizar manual para 61 deve falhar
      await assert.rejects(
        () => UpdateDisciplineService(discipline.id, { absences: 61 }),
        { message: "O número de faltas não pode ultrapassar a carga horária total." }
      );

      // Tentar atualizar manual para valor negativo deve falhar
      await assert.rejects(
        () => UpdateDisciplineService(discipline.id, { absences: -1 }),
        { message: "O número de faltas não pode ser negativo." }
      );

      // 7. RN04 no SetAttendanceService: com manual em 60, não pode adicionar falta em horário
      await assert.rejects(
        () => SetAttendanceService(user.id, schedule.id, false, today),
        { message: "O número de faltas não pode ultrapassar a carga horária total da disciplina." }
      );
    } finally {
      await prisma.user.delete({ where: { id: user.id } });
    }
  }
);
