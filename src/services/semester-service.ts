import { prisma } from "../../lib/prisma.ts";
import type {
  CreateSemesterSchemaType,
  UpdateSemesterSchemaType,
} from "../schemas/semester-schema.ts";

export function FindSemestersByUserService(userId: string) {
  return prisma.semester.findMany({
    where: { userId },
    orderBy: [{ isCurrent: "desc" }, { name: "desc" }, { createdAt: "desc" }],
    include: {
      _count: {
        select: {
          disciplines: true,
          tasks: true,
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
      tasks: true,
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
      },
    });
  }

  // Link any orphaned disciplines to this semester
  await prisma.discipline.updateMany({
    where: { userId, semesterId: null },
    data: { semesterId: semester.id },
  });

  // Link any orphaned tasks to this semester
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
  await prisma.semester.updateMany({
    where: { userId },
    data: { isCurrent: false },
  });

  return prisma.semester.update({
    where: { id: semesterId },
    data: { isCurrent: true },
  });
}

export function DeleteSemesterService(id: string) {
  return prisma.semester.delete({
    where: { id },
  });
}
