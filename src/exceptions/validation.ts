import z from "zod";
import { BadRequestsException } from "./bad-requests";
import { ErrorCode } from "./root";

export class ValidationException extends BadRequestsException {
  constructor(message: string, ...results: { error?: z.ZodError }[]) {
    const errors = results.flatMap((result) => result.error?.issues.map((issue) => {
      return {
        field: issue.path.map(String).join("."),
        code: issue.code,
        message: issue.message,
      };
    }) ?? []);
    super(message, ErrorCode.INVALID_DATA, errors);
  }
}
