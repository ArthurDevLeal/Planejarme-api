import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client.ts";

const databaseUrl = new URL(process.env.DATABASE_URL!);
databaseUrl.searchParams.set("sslmode", "verify-full");

const adapter = new PrismaPg({ connectionString: databaseUrl.toString() });
const prisma = new PrismaClient({ adapter });

export { prisma };
