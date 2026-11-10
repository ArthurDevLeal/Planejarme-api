import { prisma } from "../../lib/prisma.ts";
import { BadRequestsException } from "../exceptions/bad-requests.ts";
import { ErrorCode } from "../exceptions/root.ts";
import { CreateDisciplineSchemaType, UpdateDisciplineSchemaType } from "../schemas/discipline-schema.ts";
import { brasiliaDate, courseWindow, scheduleAbsences } from "../utils/academic-date.ts";

import { EnsureUserHasCurrentSemester, attendanceAnchorForSemester } from "./semester-service.ts";

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
  const attendanceSince = await attendanceAnchorForSemester(semesterId);

  let schedulesToCreate:
    | { dayOfWeek: number; startTime: string | null; endTime: string | null; attendanceSince: Date }[]
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
      attendanceSince,
    }));
  } else if (days && days.length > 0) {
    schedulesToCreate = [...new Set(days)].map((dayOfWeek) => ({
      dayOfWeek,
      startTime: startTime ?? null,
      endTime: endTime ?? null,
      attendanceSince,
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
    include: { schedules: true, materials: { where: { deletedAt: null } }, evaluations: true },
  });
}

export function FindDisciplineByIdService(id: string) {
  return prisma.discipline.findUnique({
    where: { id },
    include: {
      semester: true,
      schedules: { include: { attendances: true } },
      materials: { where: { deletedAt: null } },
    },
  });
}

export function FindDisciplinesByUserService(userId: string, semesterId?: string) {
  return prisma.discipline.findMany({
    where: { userId, ...(semesterId ? { semesterId } : {}) },
    include: {
      semester: true,
      schedules: { include: { attendances: true } },
      materials: { where: { deletedAt: null } },
    },
    orderBy: { name: "asc" },
  });
}

export async function UpdateDisciplineService(id: string, data: UpdateDisciplineSchemaType) {
  if (data.absences !== undefined || data.workloadHours !== undefined) {
    const existing = await prisma.discipline.findUnique({
      where: { id },
      include: {
        semester: true,
        schedules: {
          include: { attendances: true },
        },
      },
    });
    if (existing) {
      const today = brasiliaDate();
      const window = courseWindow(existing.semester);
      const scheduleAbsencesTotal = existing.schedules.reduce(
        (total, schedule) => total + scheduleAbsences(schedule, today, window),
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
