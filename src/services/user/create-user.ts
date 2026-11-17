import { hash } from "bcrypt";
import { track } from "../../lib/analytics.ts";
import { prisma } from "../../../lib/prisma.ts";
import { CreateUserSchemaType } from "../../schemas/user-schema.ts";
import { TRIAL_DAYS } from "../../config/plans.ts";
import { SendWelcomeEmail } from "../lifecycle-email-service.ts";
import { ResolveReferrerService } from "../affiliate-service.ts";

export async function CreateUserService(args: CreateUserSchemaType) {
  const user = await prisma.user.create({
    data: {
      name: args.name,
      email: args.email,
      passwordHash: await hash(args.password, 8),
      trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 86_400_000),
      phone: args.phone,
      course: args.course,
      institution: args.institution,
      referredById: await ResolveReferrerService(args.ref, args.email),
    },
  });
  await track(user.id, "user_signed_up", { method: "email" });
  SendWelcomeEmail(user);
  return user;
}
