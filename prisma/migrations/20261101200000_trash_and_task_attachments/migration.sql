-- RN16 (lixeira) e RF13 (anexos em tarefas). Aditiva: colunas novas nulas, nenhum dado muda.
-- AlterTable
ALTER TABLE "Material" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "taskId" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

