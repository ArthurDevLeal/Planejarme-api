/*
  Warnings:

  - Made the column `startDate` on table `Semester` required. This step will fail if there are existing NULL values in that column.
  - Made the column `endDate` on table `Semester` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Schedule" ALTER COLUMN "attendanceSince" SET DEFAULT ((CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date);

-- AlterTable
ALTER TABLE "Semester" ALTER COLUMN "startDate" SET NOT NULL,
ALTER COLUMN "endDate" SET NOT NULL;
