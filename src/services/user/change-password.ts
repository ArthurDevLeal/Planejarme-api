import { compare, hash } from "bcrypt";
import { prisma } from "../../../lib/prisma.ts";
import { BadRequestsException } from "../../exceptions/bad-requests.ts";
import { ErrorCode } from "../../exceptions/root.ts";
import { NotFoundException } from "../../exceptions/not-found.ts";

export async function ChangePasswordService(
  userId: string,
  currentPassword: string,
  newPassword: string,
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });
  if (!user) {
    throw new NotFoundException(
      "Usuário não encontrado. O registro pode ter sido removido.",
      ErrorCode.USER_NOT_FOUND,
    );
  }

  const matches = await compare(currentPassword, user.passwordHash);
  if (!matches) {
    throw new BadRequestsException(
      "A senha atual está incorreta.",
      ErrorCode.INVALID_DATA,
    );
  }

  if (currentPassword === newPassword) {
    throw new BadRequestsException(
      "A nova senha precisa ser diferente da senha atual.",
      ErrorCode.INVALID_DATA,
    );
  }

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hash(newPassword, 8) },
  });
}
