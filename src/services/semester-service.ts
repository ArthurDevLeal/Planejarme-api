import { prisma } from "../../lib/prisma.ts";
import { BadRequestsException } from "../exceptions/bad-requests.ts";
import { NotFoundException } from "../exceptions/not-found.ts";
import { ErrorCode } from "../exceptions/root.ts";
import type {
  CopyDisciplinesSchemaType,
  CreateSemesterSchemaType,
  UpdateSemesterSchemaType,
} from "../schemas/semester-schema.ts";

const SIX_MONTHS_MS = 182 * 24 * 60 * 60 * 1000;

function currentSemesterDefaults(now = new Date()) {
  const startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return { startDate, endDate: new Date(startDate.getTime() + SIX_MONTHS_MS) };
}

export function utcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export async function attendanceAnchorForSemester(semesterId: string): Promise<Date> {
  const semester = await prisma.semester.findUnique({
    where: { id: semesterId },
    select: { startDate: true },
  });
  return utcDay(semester?.startDate ?? new Date());
}

export function FindSemestersByUserService(userId: string) {
  return prisma.semester.findMany({
    where: { userId },
    orderBy: [{ isCurrent: "desc" }, { name: "desc" }, { createdAt: "desc" }],
    include: {
      _count: {
        select: {
          disciplines: true,
          tasks: { where: { deletedAt: null } },
        },
      },
    },
  });
}

export function FindSemesterByIdService(id: string) {
  return prisma.semester.findUnique({
    where: { id },
    include: {
      disciplines: {
        include: {
          evaluations: true,
          schedules: true,
        },
      },
      tasks: { where: { deletedAt: null } },
    },
  });
}

export async function FindCurrentSemesterByUserService(userId: string) {
  const current = await prisma.semester.findFirst({
    where: { userId, isCurrent: true },
  });
  if (current) return current;

  return prisma.semester.findFirst({
    where: { userId },
    orderBy: [{ name: "desc" }, { createdAt: "desc" }],
  });
}

export async function EnsureUserHasCurrentSemester(userId: string) {
  let semester = await FindCurrentSemesterByUserService(userId);

  if (!semester) {
    semester = await prisma.semester.create({
      data: {
        name: "2026.2",
        isCurrent: true,
        userId,
        ...currentSemesterDefaults(),
      },
    });
  }

  await prisma.discipline.updateMany({
    where: { userId, semesterId: null },
    data: { semesterId: semester.id },
  });

  await prisma.task.updateMany({
    where: { userId, semesterId: null },
    data: { semesterId: semester.id },
  });

  return semester;
}

export async function CreateSemesterService(data: CreateSemesterSchemaType) {
  if (data.isCurrent) {
    await prisma.semester.updateMany({
      where: { userId: data.userId },
      data: { isCurrent: false },
    });
  }

  return prisma.semester.create({
    data: {
      name: data.name,
      startDate: data.startDate,
      endDate: data.endDate,
      isCurrent: data.isCurrent ?? false,
      userId: data.userId,
    },
  });
}

export async function UpdateSemesterService(
  id: string,
  data: UpdateSemesterSchemaType,
) {
  if (data.isCurrent) {
    const existing = await prisma.semester.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (existing) {
      await prisma.semester.updateMany({
        where: { userId: existing.userId },
        data: { isCurrent: false },
      });
    }
  }

  return prisma.semester.update({
    where: { id },
    data,
  });
}

export async function SetCurrentSemesterService(
  userId: string,
  semesterId: string,
) {
  const semester = await prisma.semester.findFirst({
    where: { id: semesterId, userId },
    select: { id: true },
  });
  if (!semester) {
    throw new NotFoundException(
      "Semestre não encontrado. O registro pode ter sido removido.",
      ErrorCode.SEMESTER_NOT_FOUND,
    );
  }

  await prisma.semester.updateMany({
    where: { userId },
    data: { isCurrent: false },
  });

  return prisma.semester.update({
    where: { id: semesterId },
    data: { isCurrent: true },
  });
}

export async function CopyDisciplinesService(
  userId: string,
  sourceSemesterId: string,
  data: CopyDisciplinesSchemaType,
) {
  if (sourceSemesterId === data.targetSemesterId) {
    throw new BadRequestsException(
      "Escolha um semestre de destino diferente do semestre de origem.",
      ErrorCode.INVALID_DATA,
    );
  }

  const semesters = await prisma.semester.findMany({
    where: { id: { in: [sourceSemesterId, data.targetSemesterId] } },
    select: { id: true, userId: true, startDate: true },
  });
  const source = semesters.find((semester) => semester.id === sourceSemesterId);
  const target = semesters.find((semester) => semester.id === data.targetSemesterId);
  if (!source || source.userId !== userId) {
    throw new NotFoundException(
      "Semestre de origem não encontrado.",
      ErrorCode.SEMESTER_NOT_FOUND,
    );
  }
  if (!target || target.userId !== userId) {
    throw new NotFoundException(
      "Semestre de destino não encontrado.",
      ErrorCode.SEMESTER_NOT_FOUND,
    );
  }

  const disciplines = await prisma.discipline.findMany({
    where: {
      userId,
      semesterId: sourceSemesterId,
      ...(data.disciplineIds && data.disciplineIds.length > 0
        ? { id: { in: data.disciplineIds } }
        : {}),
    },
    include: { schedules: true },
    orderBy: { name: "asc" },
  });

  if (disciplines.length === 0) {
    throw new BadRequestsException(
      "Nenhuma disciplina foi selecionada para copiar.",
      ErrorCode.INVALID_DATA,
    );
  }

  return prisma.$transaction(
    disciplines.map((discipline) =>
      prisma.discipline.create({
        data: {
          name: discipline.name,
          professor: discipline.professor,
          classroom: discipline.classroom,
          workloadHours: discipline.workloadHours,
          gradingSystem: discipline.gradingSystem,
          absences: 0,
          userId,
          semesterId: data.targetSemesterId,
          schedules: data.copySchedules
            ? {
                create: discipline.schedules.map((schedule) => ({
                  dayOfWeek: schedule.dayOfWeek,
                  startTime: schedule.startTime,
                  endTime: schedule.endTime,
                  attendanceSince: utcDay(target.startDate),
                })),
              }
            : undefined,
        },
        include: { schedules: true },
      }),
    ),
  );
}

export function DeleteSemesterService(id: string) {
  return prisma.semester.delete({
    where: { id },
  });
}
