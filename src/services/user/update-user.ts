import { hash } from "bcrypt";
import { prisma } from "../../../lib/prisma";
import { UpdateUserSchemaType } from "../../schemas/user-schema";

export async function UpdateUserService(id: string, args: UpdateUserSchemaType) {
  const { password, ...userData } = args;
  const data = password ? { ...userData, passwordHash: await hash(password, 8) } : userData;

  return await prisma.user.update({
    where: { id },
    data,
  });
}
