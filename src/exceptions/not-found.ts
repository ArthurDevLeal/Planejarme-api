import { ErrorCode, HttpException } from "./root.ts";

export class NotFoundException extends HttpException {
  constructor(message: string, errorCode: ErrorCode) {
    super(message, errorCode, 404);
  }
}