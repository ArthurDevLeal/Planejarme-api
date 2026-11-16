// Conta de verificação das telas de estudos (regra, risco, turma, simulado, wrapped). Só para o banco de dev.
// Uso: npx tsx scripts/estudos-demo-seed.ts  → imprime um JWT de 1 dia para o cookie auth_token do web.
import "dotenv/config";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.ts";
import { EnsureUserHasCurrentSemester } from "../src/services/semester-service.ts";

const EMAIL = "estudos-demo@planejarme.invalid";
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000);

await prisma.user.deleteMany({ where: { email: EMAIL } });
const user = await prisma.user.create({
  data: { name: "Ana Estudos", email: EMAIL, passwordHash: "!", plan: "PRO", subscriptionStatus: "ACTIVE", currentPeriodEnd: day(30) },
});
const semester = await EnsureUserHasCurrentSemester(user.id);

const make = (name: string, data: object, evaluations: { title: string; score: number | null; offset: number; weight?: number; kind?: string }[]) =>
  prisma.discipline.create({
    data: {
      name, workloadHours: 60, userId: user.id, semesterId: semester.id, ...data,
      evaluations: { create: evaluations.map((e) => ({ title: e.title, score: e.score, weight: e.weight ?? 1, date: day(e.offset), kind: e.kind ?? "REGULAR" })) },
    },
  });

await make("Cálculo II", { professor: "Marta Lima", classroom: "B12", color: 0, icon: "math-function" }, [
  { title: "P1", score: 5.5, offset: -30 },
  { title: "P2", score: null, offset: 5 },
]);
await make("Física I", { professor: "Rui Costa", classroom: "Lab 3", absences: 13, passingScore: 6, maxAbsencePct: 25 }, [
  { title: "P1", score: 7, offset: -20 },
  { title: "P2", score: null, offset: 12 },
]);
await make("Algoritmos", { professor: "Lia Souza", classroom: "C4", gradingSystem: "WEIGHTED" }, [
  { title: "AV1", score: 9, offset: -40, weight: 4 },
  { title: "AV2", score: 8.5, offset: -10, weight: 6 },
]);
await make("Estatística", { professor: "Caio Nunes", finalMinAverage: 4, finalPassingScore: 5 }, [
  { title: "P1", score: 5, offset: -40 },
  { title: "P2", score: 5.5, offset: -8 },
  { title: "Final", score: null, offset: 9, kind: "FINAL" },
]);

console.log(jwt.sign({ id: user.id }, process.env.JWT_SECRET!, { expiresIn: "1d" }));
await prisma.$disconnect();
