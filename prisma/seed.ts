import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "bcrypt";
import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";

const connectionString = `${process.env.DATABASE_URL}`;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const demoEmail = "demo@planejarme.com";

async function main() {
  const passwordHash = await hash("password123", 10);
  const demoUser = await prisma.user.upsert({
    where: { email: demoEmail },
    update: {
      name: "Ana Carolina Demo",
      passwordHash,
      phone: "+55 11 99999-0000",
      course: "Engenharia de Software",
      institution: "Universidade Planejar-me",
      passingScore: 7,
      maxAbsencePct: 25,
    },
    create: {
      name: "Ana Carolina Demo",
      email: demoEmail,
      passwordHash,
      phone: "+55 11 99999-0000",
      course: "Engenharia de Software",
      institution: "Universidade Planejar-me",
      passingScore: 7,
      maxAbsencePct: 25,
    },
  });

  await prisma.passwordResetToken.deleteMany({ where: { userId: demoUser.id } });
  await prisma.notification.deleteMany({ where: { userId: demoUser.id } });
  await prisma.inboxItem.deleteMany({ where: { userId: demoUser.id } });
  await prisma.task.deleteMany({ where: { userId: demoUser.id } });
  await prisma.discipline.deleteMany({ where: { userId: demoUser.id } });
  await prisma.semester.deleteMany({ where: { userId: demoUser.id } });

  const currentSemester = await prisma.semester.create({
    data: {
      name: "2026.2",
      isCurrent: true,
      startDate: new Date("2026-08-01T00:00:00.000Z"),
      endDate: new Date("2026-12-20T23:59:59.000Z"),
      userId: demoUser.id,
    },
  });

  const algorithms = await prisma.discipline.create({
    data: {
      name: "Algoritmos e Estruturas de Dados",
      professor: "Mariana Costa",
      classroom: "Bloco A - 204",
      workloadHours: 80,
      absences: 2,
      gradingSystem: "ARITHMETIC",
      userId: demoUser.id,
      semesterId: currentSemester.id,
      schedules: {
        create: [
          { dayOfWeek: 2, startTime: "19:00", endTime: "20:40" },
          { dayOfWeek: 4, startTime: "19:00", endTime: "20:40" },
        ],
      },
      materials: {
        create: [
          {
            title: "Lista de exercícios 01",
            type: "PDF",
            url: "https://example.com/materials/algoritmos-lista-01.pdf",
            fileSizeMb: 1.4,
          },
          {
            title: "Aula sobre árvores",
            type: "VIDEO",
            url: "https://example.com/materials/arvores",
            fileSizeMb: 85.2,
          },
        ],
      },
      evaluations: {
        create: [
          { title: "Prova 1", weight: 2, score: 8.5, date: new Date("2026-09-15T19:00:00.000Z") },
          { title: "Projeto final", weight: 3, score: null, date: new Date("2026-10-20T19:00:00.000Z") },
        ],
      },
    },
  });

  const databases = await prisma.discipline.create({
    data: {
      name: "Banco de Dados",
      professor: "Rafael Mendes",
      classroom: "Laboratório 03",
      workloadHours: 60,
      absences: 4,
      gradingSystem: "ARITHMETIC",
      userId: demoUser.id,
      semesterId: currentSemester.id,
      schedules: {
        create: [{ dayOfWeek: 3, startTime: "19:00", endTime: "20:40" }],
      },
      materials: {
        create: [
          {
            title: "Guia de modelagem relacional",
            type: "DOCUMENT",
            url: "https://example.com/materials/modelagem-relacional",
            fileSizeMb: 2.1,
          },
        ],
      },
      evaluations: {
        create: [
          { title: "Trabalho de modelagem", weight: 1, score: 9, date: new Date("2026-09-25T19:00:00.000Z") },
          { title: "Prova final", weight: 2, score: null, date: new Date("2026-11-10T19:00:00.000Z") },
        ],
      },
    },
  });

  await prisma.task.createMany({
    data: [
      {
        title: "Revisar árvores binárias",
        dueDate: new Date("2026-09-12T23:59:00.000Z"),
        priority: "HIGH",
        status: "PENDING",
        userId: demoUser.id,
        disciplineId: algorithms.id,
        semesterId: currentSemester.id,
      },
      {
        title: "Entregar modelo entidade-relacionamento",
        dueDate: new Date("2026-09-18T23:59:00.000Z"),
        priority: "HIGH",
        status: "IN_PROGRESS",
        userId: demoUser.id,
        disciplineId: databases.id,
        semesterId: currentSemester.id,
      },
      {
        title: "Ler capítulo de complexidade",
        dueDate: new Date("2026-09-05T23:59:00.000Z"),
        priority: "LOW",
        status: "COMPLETED",
        completedAt: new Date("2026-09-04T18:00:00.000Z"),
        userId: demoUser.id,
        disciplineId: algorithms.id,
        semesterId: currentSemester.id,
      },
    ],
  });

  await prisma.inboxItem.createMany({
    data: [
      {
        title: "Material compartilhado",
        content: "A professora Mariana compartilhou uma nova lista de exercícios.",
        type: "MATERIAL",
        fileUrl: "https://example.com/inbox/lista-exercicios-02.pdf",
        userId: demoUser.id,
      },
      {
        title: "Aviso da turma",
        content: "A aula de Banco de Dados desta semana será no Laboratório 03.",
        type: "ANNOUNCEMENT",
        userId: demoUser.id,
      },
    ],
  });

  await prisma.notification.createMany({
    data: [
      {
        title: "Prazo se aproximando",
        message: "A entrega do modelo entidade-relacionamento vence em breve.",
        type: "TASK_DUE",
        read: false,
        userId: demoUser.id,
      },
      {
        title: "Bem-vinda ao Planejar-me",
        message: "Seu espaço acadêmico está pronto para uso.",
        type: "SYSTEM",
        read: true,
        userId: demoUser.id,
      },
    ],
  });

  console.log("Seed concluído");
  console.log(`Usuário demo: ${demoEmail}`);
  console.log("Senha demo: password123");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
