import { ErrorCode, HttpException } from "./root.ts";

export class UnauthorizedException extends HttpException {
  constructor(message: string, errorCode: ErrorCode) {
    super(message, errorCode, 401);
  }
}