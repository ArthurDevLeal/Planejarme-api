import { ValidationException } from "../exceptions/validation.ts";
import { compare, hashSync } from "bcrypt";
import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { BadRequestsException } from "../exceptions/bad-requests.ts";
import { ErrorCode } from "../exceptions/root.ts";
import { SignInSchema } from "../schemas/auth-schema.ts";
import { FindUserByEmailSchema } from "../schemas/user-schema.ts";
import { FindUserByEmailService } from "../services/user/find-user-by-email.ts";
import { sendSuccess } from "../utils/api-response.ts";
import { ErrorHandler } from "../utils/error-handler.ts";

const DUMMY_PASSWORD_HASH = hashSync("planejarme-dummy-password", 10);

export class AuthController {
  SingIn = ErrorHandler(async (req: Request, res: Response) => {
    const result = SignInSchema.safeParse(req.body);
    if (!result.success) {
      throw new ValidationException("Os dados enviados são inválidos. Confira os campos indicados e tente novamente.", result);
    }

    const emailSchema = FindUserByEmailSchema.safeParse({ email: result.data.email });
    if (!emailSchema.success) {
      throw new ValidationException("O e-mail informado é inválido. Confira o endereço.", emailSchema);
    }

    const user = await FindUserByEmailService(emailSchema.data);
    // Mesmo erro e mesmo custo de bcrypt para e-mail inexistente: não revela quais contas existem.
    const isPasswordValid = await compare(result.data.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!user || !isPasswordValid) {
      throw new BadRequestsException("E-mail ou senha incorretos. Confira os dados e tente novamente.", ErrorCode.INVALID_CREDENTIALS);
    }

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET!, { expiresIn: "7d" });

    return sendSuccess(res, { token }, "User signed in");
  });
}
