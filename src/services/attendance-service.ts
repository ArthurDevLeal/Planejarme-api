import { prisma } from "../../lib/prisma";
import { BadRequestsException } from "../exceptions/bad-requests";
import { NotFoundException } from "../exceptions/not-found";
import { ErrorCode } from "../exceptions/root";
import { brasiliaDate, scheduleAbsences } from "../utils/academic-date";

export async function SetAttendanceService(userId: string, scheduleId: string, attended: boolean, requestedDate?: string) {
  const today = brasiliaDate();
  const date = new Date(`${requestedDate ?? today}T00:00:00Z`);
  const schedule = await prisma.schedule.findFirst({
    where: { id: scheduleId, discipline: { userId } },
    include: {
      discipline: {
        include: {
          schedules: {
            include: { attendances: true },
          },
        },
      },
    },
  });
  if (!schedule) throw new NotFoundException("Aula não encontrada.", ErrorCode.SCHEDULE_NOT_FOUND);
  const end = new Date(schedule.attendanceSince);
  end.setUTCDate(end.getUTCDate() + 15 * 7 - 1);
  if (schedule.dayOfWeek !== date.getUTCDay() || schedule.attendanceSince > date || date > end || date > new Date(`${today}T00:00:00Z`)) {
    throw new BadRequestsException("A data precisa ser um dia de aula dentro das 15 semanas do semestre.", ErrorCode.INVALID_DATA);
  }

  // RN04 — Trava de Carga Horária Excedida:
  // Se está registrando falta (attended = false), verificar se não ultrapassa a carga horária total
  if (!attended) {
    const existingRecord = await prisma.scheduleAttendance.findUnique({
      where: { scheduleId_date: { scheduleId, date } },
    });
    const currentAbsences =
      schedule.discipline.absences +
      schedule.discipline.schedules.reduce(
        (total, s) => total + scheduleAbsences(s, today),
        0
      );
    // Se o registro anterior era attended = true, alterá-lo para attended = false adiciona 1 falta.
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

  // RN03 — O estado desejado é idempotente: repetir uma requisição não duplica a aula.
  return prisma.scheduleAttendance.upsert({
    where: { scheduleId_date: { scheduleId, date } },
    create: { scheduleId, date, attended }, update: { attended },
  });
}
