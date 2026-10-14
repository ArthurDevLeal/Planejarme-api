import { prisma } from "../../../lib/prisma.ts";
import { FindUserByEmailSchemaType } from "../../schemas/user-schema.ts";

export async function FindUserByEmailService(arg: FindUserByEmailSchemaType) {
  return await prisma.user.findUnique({
    where: { email: arg.email },
  });
}
