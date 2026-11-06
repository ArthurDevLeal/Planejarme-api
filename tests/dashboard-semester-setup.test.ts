import "dotenv/config";
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { prisma } from "../lib/prisma.ts";
import { GetUserDashboardService, GetUserDisciplinesService } from "../src/services/user/get-user-dashboard.ts";

const user = { id: "u", name: "Ana", email: "a@example.invalid", phone: null, course: null, institution: null, passingScore: 7, maxAbsencePct: 25, roundingMode: "NEAREST" };
const semester = { id: "s", name: "2026.2", isCurrent: true, startDate: null, endDate: null };

function stubDatabase(t: TestContext, { semesters = [semester] as unknown[], orphan = null as { id: string } | null } = {}) {
  // Os delegates do Prisma são Proxies, que t.mock.method não aceita.
  const stub = (target: object, name: string, value: unknown) => {
    const delegate = target as Record<string, unknown>;
    const original = delegate[name];
    const mock = t.mock.fn(async () => value);
    delegate[name] = mock;
    t.after(() => { delegate[name] = original; });
    return mock;
  };
  stub(prisma.user, "findUnique", user);
  const findSemesters = stub(prisma.semester, "findMany", semesters);
  stub(prisma.semester, "findFirst", semester);
  stub(prisma.discipline, "findFirst", orphan);
  stub(prisma.task, "findFirst", null);
  stub(prisma.discipline, "findMany", []);
  stub(prisma.task, "findMany", []);
  stub(prisma.inboxItem, "findMany", []);
  stub(prisma.notification, "findMany", []);
  stub(prisma.task, "updateMany", { count: 0 });
  const linkDisciplines = stub(prisma.discipline, "updateMany", { count: 1 });
  return { findSemesters, linkDisciplines };
}

test("dashboard não escreve no banco quando semestre e vínculos já estão certos", async (t) => {
  const { findSemesters, linkDisciplines } = stubDatabase(t);
  const dashboard = await GetUserDashboardService("u");
  assert.equal(dashboard?.currentSemesterId, "s");
  assert.equal(linkDisciplines.mock.callCount(), 0);
  assert.equal(findSemesters.mock.callCount(), 1);
});

test("dashboard vincula disciplina órfã antes de ler os dados", async (t) => {
  const { findSemesters, linkDisciplines } = stubDatabase(t, { orphan: { id: "d" } });
  await GetUserDashboardService("u");
  assert.equal(linkDisciplines.mock.callCount(), 1);
  assert.equal(findSemesters.mock.callCount(), 2);
});

test("dashboard cuida do semestre de quem ainda não tem nenhum", async (t) => {
  const { findSemesters, linkDisciplines } = stubDatabase(t, { semesters: [] });
  await GetUserDashboardService("u");
  assert.equal(linkDisciplines.mock.callCount(), 1);
  assert.equal(findSemesters.mock.callCount(), 2);
});

test("disciplinas trazem só o que a tela pediu", async (t) => {
  const row = {
    id: "d", workloadHours: 60, absences: 2, semester: { startDate: null, endDate: null },
    schedules: [{ id: "h", dayOfWeek: 1, attendanceSince: new Date("2026-08-01"), attendances: [] }],
  };
  const original = prisma.discipline.findMany;
  const findMany = t.mock.fn(async () => [row]);
  (prisma.discipline as unknown as Record<string, unknown>).findMany = findMany;
  t.after(() => { (prisma.discipline as unknown as Record<string, unknown>).findMany = original; });

  await GetUserDisciplinesService("u", "s");
  const lean = (findMany.mock.calls[0].arguments as unknown as [{ include: Record<string, unknown> }])[0].include;
  assert.deepEqual(lean, { semester: false, schedules: false, materials: false, evaluations: false });

  const [withSchedules] = await GetUserDisciplinesService("u", "s", ["schedules"]);
  assert.equal(withSchedules.manualAbsences, 2);
  assert.ok(withSchedules.schedules && !("attendances" in withSchedules.schedules[0]));

  const [withAttendances] = await GetUserDisciplinesService("u", "s", ["attendances"]);
  assert.ok(withAttendances.schedules && "attendances" in withAttendances.schedules[0]);
});
