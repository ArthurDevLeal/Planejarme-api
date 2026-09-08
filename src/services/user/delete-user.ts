import { prisma } from "../../../lib/prisma";
import { DeleteUserSchemaType } from "../../schemas/user-schema";

export async function DeleteUserService(arg: DeleteUserSchemaType) {
  return await prisma.user.delete({
    where: { id: arg.id },
  });
}
