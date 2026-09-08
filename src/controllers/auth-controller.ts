import { compare } from "bcrypt";
import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { BadRequestsException } from "../exceptions/bad-requests";
import { NotFoundException } from "../exceptions/not-found";
import { ErrorCode } from "../exceptions/root";
import { SignInSchema } from "../schemas/auth-schema";
import { FindUserByEmailSchema } from "../schemas/user-schema";
import { FindUserByEmailService } from "../services/user/find-user-by-email";
import { sendSuccess } from "../utils/api-response";
import { ErrorHandler } from "../utils/error-handler";

export class AuthController {
  SingIn = ErrorHandler(async (req: Request, res: Response) => {
    const result = SignInSchema.safeParse(req.body);
    if (!result.success) {
      throw new BadRequestsException("Invalid data", ErrorCode.INVALID_DATA);
    }

    const emailSchema = FindUserByEmailSchema.safeParse({ email: result.data.email });
    if (!emailSchema.success) {
      throw new BadRequestsException("Invalid email", ErrorCode.INVALID_DATA);
    }

    const user = await FindUserByEmailService(emailSchema.data);
    if (!user) {
      throw new NotFoundException("User not found", ErrorCode.USER_NOT_FOUND);
    }

    const isPasswordValid = await compare(result.data.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new BadRequestsException("Invalid password", ErrorCode.INVALID_CREDENTIALS);
    }

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET!, { expiresIn: "7d" });

    return sendSuccess(res, { token }, "User signed in");
  });
}
