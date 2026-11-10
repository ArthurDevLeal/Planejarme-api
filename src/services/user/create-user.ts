import { hash } from "bcrypt";
import { prisma } from "../../../lib/prisma.ts";
import { CreateUserSchemaType } from "../../schemas/user-schema.ts";
import { ResolveReferrerService } from "../affiliate-service.ts";

export async function CreateUserService(args: CreateUserSchemaType) {
  return await prisma.user.create({
    data: {
      name: args.name,
      email: args.email,
      passwordHash: await hash(args.password, 8),
      phone: args.phone,
      course: args.course,
      institution: args.institution,
      referredById: await ResolveReferrerService(args.ref, args.email),
    },
  });
}
