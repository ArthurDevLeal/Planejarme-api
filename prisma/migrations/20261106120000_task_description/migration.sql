-- Texto da tarefa, escrito no drawer do quadro. Aditiva: coluna nova nula, nenhum dado muda.
-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "description" JSONB;
