import { prisma } from "../../../lib/prisma";
import { FindUserByEmailSchemaType } from "../../schemas/user-schema";

export async function FindUserByEmailService(arg: FindUserByEmailSchemaType) {
  return await prisma.user.findUnique({
    where: { email: arg.email },
  });
}
