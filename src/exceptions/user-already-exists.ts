import { BadRequestsException } from "./bad-requests";
import { ErrorCode } from "./root";

export class UserAlreadyExistsException extends BadRequestsException {
  constructor() {
    super("Este e-mail ou telefone já está cadastrado. Use outros dados ou entre na sua conta.", ErrorCode.USER_ALREADY_EXISTS);
  }
}
