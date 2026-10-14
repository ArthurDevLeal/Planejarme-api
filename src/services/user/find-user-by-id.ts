import { prisma } from "../../../lib/prisma.ts";
import { FindUserByIdSchemaType } from "../../schemas/user-schema.ts";

export async function FindUserByIdService(arg: FindUserByIdSchemaType) {
  return await prisma.user.findUnique({
    where: { id: arg.id },
  });
}
