import { ErrorCode, HttpException } from "../exceptions/root";
import { UserAlreadyExistsException } from "../exceptions/user-already-exists";

const resources: Record<string, { code: ErrorCode; label: string }> = {
  User: { code: ErrorCode.USER_NOT_FOUND, label: "Usuário" },
  Discipline: { code: ErrorCode.DISCIPLINE_NOT_FOUND, label: "Disciplina" },
  Evaluation: { code: ErrorCode.EVALUATION_NOT_FOUND, label: "Avaliação" },
  Task: { code: ErrorCode.TASK_NOT_FOUND, label: "Tarefa" },
  Material: { code: ErrorCode.MATERIAL_NOT_FOUND, label: "Material" },
  Schedule: { code: ErrorCode.SCHEDULE_NOT_FOUND, label: "Horário" },
  InboxItem: { code: ErrorCode.INBOX_ITEM_NOT_FOUND, label: "Item da caixa de entrada" },
  Notification: { code: ErrorCode.NOTIFICATION_NOT_FOUND, label: "Notificação" },
};

export function normalizeError(error: unknown): HttpException {
  if (error instanceof HttpException) return error;
  const value = error !== null && typeof error === "object" ? error as Record<string, unknown> : {};

  if (value.type === "entity.parse.failed") {
    return new HttpException("O corpo da solicitação contém um JSON inválido. Confira a formatação dos dados.", ErrorCode.INVALID_JSON, 400);
  }
  if (value.type === "entity.too.large") {
    return new HttpException("Os dados enviados ultrapassam o limite permitido. Reduza o tamanho da solicitação.", ErrorCode.PAYLOAD_TOO_LARGE, 413);
  }

  if (typeof value.name === "string" && value.name.startsWith("PrismaClient")) {
    const meta = value.meta !== null && typeof value.meta === "object" ? value.meta as Record<string, unknown> : {};
    switch (value.code) {
      case "P2002":
        if (meta.modelName === "User") return new UserAlreadyExistsException();
        return new HttpException("Já existe um registro com esses dados. Confira os dados antes de salvar novamente.", ErrorCode.DUPLICATE_RECORD, 409);
      case "P2025": {
        const resource = typeof meta.modelName === "string" && Object.hasOwn(resources, meta.modelName) ? resources[meta.modelName] : undefined;
        return new HttpException(
          `${resource?.label ?? "Registro"} não encontrado. Ele pode ter sido removido. Atualize a página e tente novamente.`,
          resource?.code ?? ErrorCode.NOT_FOUND, 404,
        );
      }
      case "P2003":
        return new HttpException("Um dos registros vinculados não existe ou impede esta operação. Confira o usuário e a disciplina selecionados.", ErrorCode.RELATED_RECORD_NOT_FOUND, 409);
      case "P1001":
      case "P1002":
      case "P1008":
      case "P1017":
      case "P2024":
        return new HttpException("O serviço está temporariamente indisponível. Tente novamente em instantes.", ErrorCode.SERVICE_UNAVAILABLE, 503);
    }
  }

  return new HttpException("Não foi possível concluir a solicitação por um erro no servidor. Tente novamente em instantes.", ErrorCode.INTERNAL_SERVER_ERROR, 500);
}
