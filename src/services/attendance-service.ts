import { prisma } from "../../lib/prisma.ts";
import { BadRequestsException } from "../exceptions/bad-requests.ts";
import { NotFoundException } from "../exceptions/not-found.ts";
import { ErrorCode } from "../exceptions/root.ts";
import { attendanceWindowEnd, brasiliaDate, courseWindow, effectiveAttendanceStart, scheduleAbsences } from "../utils/academic-date.ts";

export async function SetAttendanceService(userId: string, scheduleId: string, attended: boolean, requestedDate?: string) {
  const today = brasiliaDate();
  const date = new Date(`${requestedDate ?? today}T00:00:00Z`);
  const schedule = await prisma.schedule.findFirst({
    where: { id: scheduleId, discipline: { userId } },
    include: {
      discipline: {
        include: {
          semester: true,
          schedules: {
            include: { attendances: true },
          },
        },
      },
    },
  });
  if (!schedule) throw new NotFoundException("Aula não encontrada.", ErrorCode.SCHEDULE_NOT_FOUND);
  const window = courseWindow(schedule.discipline.semester);
  const start = effectiveAttendanceStart(schedule.attendanceSince, window);
  const end = attendanceWindowEnd(schedule.attendanceSince, today, window);
  if (schedule.dayOfWeek !== date.getUTCDay() || date.getTime() < start.getTime() || date.getTime() > end || date > new Date(`${today}T00:00:00Z`)) {
    throw new BadRequestsException("A data precisa ser um dia de aula dentro do período letivo do semestre.", ErrorCode.INVALID_DATA);
  }

  if (!attended) {
    const existingRecord = await prisma.scheduleAttendance.findUnique({
      where: { scheduleId_date: { scheduleId, date } },
    });
    const currentAbsences =
      schedule.discipline.absences +
      schedule.discipline.schedules.reduce(
        (total, s) => total + scheduleAbsences(s, today, window),
        0
      );
    const wouldIncrease = existingRecord?.attended === true;
    if (wouldIncrease && currentAbsences + 1 > schedule.discipline.workloadHours) {
      throw new BadRequestsException(
        "O número de faltas não pode ultrapassar a carga horária total da disciplina.",
        ErrorCode.INVALID_DATA
      );
    }
    if (!existingRecord && currentAbsences >= schedule.discipline.workloadHours) {
      throw new BadRequestsException(
        "O número de faltas não pode ultrapassar a carga horária total da disciplina.",
        ErrorCode.INVALID_DATA
      );
    }
  }

  return prisma.scheduleAttendance.upsert({
    where: { scheduleId_date: { scheduleId, date } },
    create: { scheduleId, date, attended }, update: { attended },
  });
}
