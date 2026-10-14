ALTER TABLE "Schedule" ALTER COLUMN "startTime" DROP NOT NULL;
ALTER TABLE "Schedule" ALTER COLUMN "endTime" DROP NOT NULL;
ALTER TABLE "Schedule" ADD COLUMN "attendanceSince" DATE NOT NULL DEFAULT ((CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date);

CREATE TABLE "ScheduleAttendance" (
  "id" TEXT NOT NULL,
  "scheduleId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "attended" BOOLEAN NOT NULL,
  CONSTRAINT "ScheduleAttendance_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ScheduleAttendance_scheduleId_date_key" ON "ScheduleAttendance"("scheduleId", "date");
ALTER TABLE "ScheduleAttendance" ADD CONSTRAINT "ScheduleAttendance_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
