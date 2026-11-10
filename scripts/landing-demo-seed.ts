// Conta de exemplo usada para capturar os prints e gravações da landing.
// Uso: LANDING_DEMO_PASSWORD=... node --import tsx scripts/landing-demo-seed.ts        (cria ou recria)
//      node --import tsx scripts/landing-demo-seed.ts --remove                         (apaga)
// Os dados são plausíveis e fictícios: nenhuma pessoa real, nenhum professor nomeado.
import { hash } from "bcrypt";
import { prisma } from "../lib/prisma.ts";

const email = "demo-landing@planejarme.invalid";
await prisma.user.deleteMany({ where: { email } });
if (process.argv.includes("--remove")) {
  console.log("conta de exemplo removida");
  process.exit(0);
}
const password = process.env.LANDING_DEMO_PASSWORD;
if (!password) throw new Error("Defina LANDING_DEMO_PASSWORD.");

const DAY = 86_400_000;
const today = new Date();
today.setHours(12, 0, 0, 0);
const at = (offsetDays: number, hour = 15) => {
  const date = new Date(today.getTime() + offsetDays * DAY);
  date.setHours(hour, 0, 0, 0);
  return date;
};
const weekday = today.getDay();

const user = await prisma.user.create({
  data: { name: "Arthur", email, passwordHash: await hash(password, 10), course: "Engenharia de Computação", institution: "Universidade" },
});
const semester = await prisma.semester.create({
  data: { name: "2026.2", startDate: at(-98), endDate: at(38), isCurrent: true, userId: user.id },
});

// [nome, carga, faltas, cor, ícone, dias (deslocamento a partir de hoje), início, fim, avaliações [título, dias, nota]]
const subjects: [string, number, number, number, string, number[], string, string, [string, number, number | null][]][] = [
  ["Cálculo II", 60, 4, 0, "math-function", [0, 2], "08:00", "09:40", [["P1", -60, 6.5], ["Lista 1", -45, 8], ["P2", -20, 7.2], ["P3", 16, null]]],
  ["Estruturas de Dados", 80, 2, 2, "code", [0, 3], "10:00", "11:40", [["Trabalho 1", -52, 9], ["P1", -38, 8.5], ["Trabalho 2", -6, 9.5], ["P2", 9, null]]],
  ["Física II", 60, 11, 4, "atom", [1, 3], "14:00", "15:40", [["P1", -58, 4.5], ["P2", -18, 5.8], ["P3", 20, null]]],
  ["Álgebra Linear", 60, 1, 5, "chart-bar", [1], "08:00", "09:40", [["P1", -50, 7.8], ["P2", 12, null]]],
  ["Inglês Técnico", 40, 0, 1, "language", [2], "16:00", "17:40", [["Seminário", -30, 9.2]]],
];

for (const [name, workloadHours, absences, color, icon, days, startTime, endTime, evaluations] of subjects) {
  const discipline = await prisma.discipline.create({
    data: {
      name, workloadHours, absences, color, icon, userId: user.id, semesterId: semester.id,
      // A contagem de presença começa hoje: as faltas mostradas são só as lançadas acima.
      schedules: { create: days.map((offset) => ({ dayOfWeek: (weekday + offset) % 7, startTime, endTime, attendanceSince: at(0) })) },
      evaluations: { create: evaluations.map(([title, offset, score]) => ({ title, date: at(offset), score, weight: 1 })) },
    },
  });
  const tasks: [string, number, string, string][] =
    name === "Cálculo II" ? [["Lista 4 de integrais", 0, "HIGH", "PENDING"], ["Resumo do capítulo 7", -6, "LOW", "COMPLETED"]]
    : name === "Estruturas de Dados" ? [["Entregar árvore AVL", 2, "HIGH", "IN_PROGRESS"], ["Ler capítulo de grafos", 5, "MEDIUM", "PENDING"]]
    : name === "Física II" ? [["Relatório do laboratório 3", 1, "MEDIUM", "PENDING"]]
    : name === "Álgebra Linear" ? [["Exercícios de autovalores", 4, "LOW", "PENDING"]]
    : [["Slides do seminário", -12, "MEDIUM", "COMPLETED"]];
  await prisma.task.createMany({
    data: tasks.map(([title, offset, priority, status]) => ({
      title, dueDate: at(offset, 23), priority, status, completedAt: status === "COMPLETED" ? at(offset - 1) : null,
      userId: user.id, disciplineId: discipline.id, semesterId: semester.id,
    })),
  });
  const folder = await prisma.folder.create({ data: { name: "Listas", userId: user.id, disciplineId: discipline.id } });
  // Arquivos só no banco (sem objeto no Storage): bastam para as telas de arquivos e para a barra de uso.
  await prisma.material.createMany({
    data: [
      { title: `Ementa de ${name}.pdf`, type: "PDF", url: "", mimeType: "application/pdf", userId: user.id, disciplineId: discipline.id, storagePath: `${user.id}/demo-ementa-${color}.pdf`, sizeBytes: 412_000, originalSizeBytes: 598_000, fileSizeMb: 0.39 },
      { title: "Lista 1.pdf", type: "PDF", url: "", mimeType: "application/pdf", userId: user.id, disciplineId: discipline.id, folderId: folder.id, storagePath: `${user.id}/demo-lista-${color}.pdf`, sizeBytes: 1_240_000, originalSizeBytes: 1_310_000, fileSizeMb: 1.18 },
      { title: "Slides da aula", type: "LINK", url: "https://example.com/slides", userId: user.id, disciplineId: discipline.id },
    ],
  });
}
console.log("conta de exemplo criada:", email);
