import { compare } from "bcrypt";
import { prisma } from "../../../lib/prisma.ts";
import { BadRequestsException } from "../../exceptions/bad-requests.ts";
import { NotFoundException } from "../../exceptions/not-found.ts";
import { ErrorCode } from "../../exceptions/root.ts";
import { ReleaseStorageObjects } from "../storage-service.ts";

export async function DeleteUserService(userId: string, password: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  if (!user) throw new NotFoundException("Usuário não encontrado.", ErrorCode.USER_NOT_FOUND);
  if (!(await compare(password, user.passwordHash))) {
    throw new BadRequestsException("A senha está incorreta. Confira e tente novamente.", ErrorCode.INVALID_DATA);
  }

  const ownedMaterials = { OR: [{ userId }, { discipline: { userId } }] };
  const files = await prisma.material.findMany({
    where: { ...ownedMaterials, storagePath: { not: null } },
    select: { storagePath: true, thumbnailPath: true },
  });

  await prisma.$transaction([
    prisma.material.deleteMany({ where: ownedMaterials }),
    prisma.user.delete({ where: { id: userId } }),
  ]);

  // Depois do banco: o que o Storage não remover agora entra na fila do cron.
  await ReleaseStorageObjects(files.flatMap((file) => [file.storagePath, file.thumbnailPath]));
}
