import { prisma } from "../../lib/prisma.ts";
import { BadRequestsException } from "../exceptions/bad-requests.ts";
import { ErrorCode } from "../exceptions/root.ts";
import { CreateDisciplineSchemaType, UpdateDisciplineSchemaType } from "../schemas/discipline-schema.ts";
import { brasiliaDate, scheduleAbsences } from "../utils/academic-date.ts";

import { EnsureUserHasCurrentSemester } from "./semester-service.ts";

export async function CreateDisciplineService(data: CreateDisciplineSchemaType) {
  if (data.absences !== undefined && data.absences > data.workloadHours) {
    throw new BadRequestsException(
      "O número de faltas não pode ultrapassar a carga horária total.",
      ErrorCode.INVALID_DATA,
    );
  }
  const { days, startTime, endTime, schedules, ...discipline } = data;
  let semesterId = discipline.semesterId;
  if (!semesterId) {
    const current = await EnsureUserHasCurrentSemester(discipline.userId);
    semesterId = current.id;
  }

  let schedulesToCreate:
    | { dayOfWeek: number; startTime: string | null; endTime: string | null }[]
    | undefined = undefined;

  if (schedules && schedules.length > 0) {
    const scheduleMap = new Map<number, { startTime: string | null; endTime: string | null }>();
    for (const s of schedules) {
      scheduleMap.set(s.dayOfWeek, {
        startTime: s.startTime ?? null,
        endTime: s.endTime ?? null,
      });
    }
    if (days) {
      for (const d of days) {
        if (!scheduleMap.has(d)) {
          scheduleMap.set(d, {
            startTime: startTime ?? null,
            endTime: endTime ?? null,
          });
        }
      }
    }
    schedulesToCreate = Array.from(scheduleMap.entries()).map(([dayOfWeek, times]) => ({
      dayOfWeek,
      startTime: times.startTime,
      endTime: times.endTime,
    }));
  } else if (days && days.length > 0) {
    schedulesToCreate = [...new Set(days)].map((dayOfWeek) => ({
      dayOfWeek,
      startTime: startTime ?? null,
      endTime: endTime ?? null,
    }));
  }

  return prisma.discipline.create({
    data: {
      ...discipline,
      semesterId,
      schedules: schedulesToCreate
        ? {
            create: schedulesToCreate,
          }
        : undefined,
    },
    include: { schedules: true, materials: true, evaluations: true },
  });
}

export function FindDisciplineByIdService(id: string) {
  return prisma.discipline.findUnique({
    where: { id },
    include: { schedules: { include: { attendances: true } }, materials: true },
  });
}

export function FindDisciplinesByUserService(userId: string, semesterId?: string) {
  return prisma.discipline.findMany({
    where: { userId, ...(semesterId ? { semesterId } : {}) },
    include: { schedules: { include: { attendances: true } }, materials: true },
    orderBy: { name: "asc" },
  });
}

export async function UpdateDisciplineService(id: string, data: UpdateDisciplineSchemaType) {
  if (data.absences !== undefined || data.workloadHours !== undefined) {
    const existing = await prisma.discipline.findUnique({
      where: { id },
      include: {
        schedules: {
          include: { attendances: true },
        },
      },
    });
    if (existing) {
      const today = brasiliaDate();
      const scheduleAbsencesTotal = existing.schedules.reduce(
        (total, schedule) => total + scheduleAbsences(schedule, today),
        0,
      );
      const workload = data.workloadHours ?? existing.workloadHours;
      const absences = data.absences ?? existing.absences;
      if (absences < 0) {
        throw new BadRequestsException("O número de faltas não pode ser negativo.", ErrorCode.INVALID_DATA);
      }
      if (absences + scheduleAbsencesTotal > workload) {
        throw new BadRequestsException(
          "O número de faltas não pode ultrapassar a carga horária total.",
          ErrorCode.INVALID_DATA,
        );
      }
    }
  }
  return prisma.discipline.update({ where: { id }, data });
}

export function DeleteDisciplineService(id: string) {
  return prisma.discipline.delete({ where: { id } });
}
