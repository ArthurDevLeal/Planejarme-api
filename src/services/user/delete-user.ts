import { prisma } from "../../../lib/prisma.ts";
import { DeleteUserSchemaType } from "../../schemas/user-schema.ts";

export async function DeleteUserService(arg: DeleteUserSchemaType) {
  return await prisma.user.delete({
    where: { id: arg.id },
  });
}
