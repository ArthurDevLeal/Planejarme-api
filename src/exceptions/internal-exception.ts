import { ErrorCode, HttpException } from "./root";

export class InternalException extends HttpException {
  constructor(message: string, error: unknown, errorCode: ErrorCode) {
    super(message, errorCode, 500);
  }
}
