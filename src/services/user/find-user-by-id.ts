import { prisma } from "../../../lib/prisma";
import { FindUserByIdSchemaType } from "../../schemas/user-schema";

export async function FindUserByIdService(arg: FindUserByIdSchemaType) {
  return await prisma.user.findUnique({
    where: { id: arg.id },
  });
}
