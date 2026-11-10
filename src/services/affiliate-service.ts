import crypto from "node:crypto";
import { prisma } from "../../lib/prisma.ts";
import { COMMISSION_HOLD_DAYS, commissionPct, webUrl } from "../config/billing.ts";
import { BadRequestsException } from "../exceptions/bad-requests.ts";
import { NotFoundException } from "../exceptions/not-found.ts";
import { ErrorCode } from "../exceptions/root.ts";

export const REFERRAL_CODE = /^[A-Z2-9]{8}$/;
// Sem 0/O e 1/I: o código é ditado e digitado por pessoas.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newCode = () => Array.from(crypto.randomBytes(8), (byte) => ALPHABET[byte % ALPHABET.length]).join("");

/** `ana+teste@x.com` e `Ana@x.com` são a mesma pessoa para efeito de auto-indicação. */
export const normalizeEmail = (email: string) => {
  const [local, domain = ""] = email.trim().toLowerCase().split("@");
  return `${local.split("+")[0]}@${domain}`;
};

/**
 * Quem indicou esta conta nova. Nulo se o código não existe, o afiliado está bloqueado
 * ou é a própria pessoa (mesmo e-mail) tentando se indicar.
 */
export async function ResolveReferrerService(code: string | null | undefined, newUserEmail: string) {
  const referralCode = code?.trim().toUpperCase();
  if (!referralCode || !REFERRAL_CODE.test(referralCode)) return null;
  const affiliate = await prisma.user.findUnique({ where: { referralCode }, select: { id: true, email: true, affiliateStatus: true } });
  if (!affiliate || affiliate.affiliateStatus !== "ACTIVE") return null;
  if (normalizeEmail(affiliate.email) === normalizeEmail(newUserEmail)) return null;
  return affiliate.id;
}

export async function JoinAffiliateService(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { affiliateStatus: true } });
  if (!user) throw new NotFoundException("Usuário não encontrado.", ErrorCode.USER_NOT_FOUND);
  if (!user.affiliateStatus) {
    // O código é aleatório e único no banco: em caso raro de colisão, tenta outro.
    for (let attempt = 0; ; attempt++) {
      try {
        await prisma.user.update({ where: { id: userId }, data: { referralCode: newCode(), affiliateStatus: "ACTIVE" } });
        break;
      } catch (error) {
        if (attempt >= 4 || !(typeof error === "object" && error !== null && "code" in error && error.code === "P2002")) throw error;
      }
    }
  }
  return GetAffiliateService(userId);
}

export async function GetAffiliateService(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { referralCode: true, affiliateStatus: true } });
  if (!user) throw new NotFoundException("Usuário não encontrado.", ErrorCode.USER_NOT_FOUND);
  const terms = { commissionPct: commissionPct(), holdDays: COMMISSION_HOLD_DAYS };
  if (!user.affiliateStatus) return { status: "NONE" as const, ...terms };
  // Conta suspensa: nada além do fato. Motivo e valores ficam com o admin.
  if (user.affiliateStatus === "BLOCKED") return { status: "BLOCKED" as const, ...terms };

  const [referrals, commissions, totals] = await Promise.all([
    prisma.user.findMany({ where: { referredById: userId }, select: { name: true, plan: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.commission.findMany({
      where: { affiliateId: userId },
      select: { id: true, amountCents: true, status: true, availableAt: true, paidAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.commission.groupBy({ by: ["status"], where: { affiliateId: userId }, _sum: { amountCents: true } }),
  ]);
  return {
    status: "ACTIVE" as const,
    ...terms,
    code: user.referralCode,
    link: `${webUrl()}/?ref=${user.referralCode}`,
    // Só o primeiro nome: o afiliado não precisa dos dados de quem indicou.
    referrals: referrals.map((referral) => ({ name: referral.name.trim().split(/\s+/)[0], plan: referral.plan, createdAt: referral.createdAt })),
    commissions,
    totals: Object.fromEntries(totals.map((row) => [row.status, row._sum.amountCents ?? 0])),
  };
}

// ---------------------------------------------------------------------------
// Admin (e-mails em ADMIN_EMAILS)
// ---------------------------------------------------------------------------

export async function ListAffiliatesService() {
  const [affiliates, totals] = await Promise.all([
    prisma.user.findMany({
      where: { affiliateStatus: { not: null } },
      select: { id: true, name: true, email: true, referralCode: true, affiliateStatus: true, affiliateBlockedAt: true, affiliateBlockReason: true, _count: { select: { referrals: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.commission.groupBy({ by: ["affiliateId", "status"], _sum: { amountCents: true } }),
  ]);
  return affiliates.map(({ _count, ...affiliate }) => ({
    ...affiliate,
    referralCount: _count.referrals,
    totals: Object.fromEntries(totals.filter((row) => row.affiliateId === affiliate.id).map((row) => [row.status, row._sum.amountCents ?? 0])),
  }));
}

export function ListCommissionsService(status?: string) {
  return prisma.commission.findMany({
    where: status ? { status } : {},
    select: {
      id: true, amountCents: true, status: true, availableAt: true, paidAt: true, createdAt: true, paymentId: true,
      affiliate: { select: { id: true, name: true, email: true } },
      referredUser: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
}

const audit = (affiliateId: string, action: string, adminEmail: string, reason?: string) =>
  prisma.affiliateEvent.create({ data: { affiliateId, action, adminEmail, reason } });

/** Bloqueio: o link para de atribuir, não nascem comissões novas e as não pagas ficam congeladas até o admin decidir. */
export async function BlockAffiliateService(affiliateId: string, reason: string, adminEmail: string) {
  const { count } = await prisma.user.updateMany({
    where: { id: affiliateId, affiliateStatus: "ACTIVE" },
    data: { affiliateStatus: "BLOCKED", affiliateBlockedAt: new Date(), affiliateBlockReason: reason },
  });
  if (count === 0) throw new BadRequestsException("Este afiliado não está ativo.", ErrorCode.INVALID_DATA);
  await prisma.$transaction([
    prisma.commission.updateMany({ where: { affiliateId, status: { in: ["PENDING", "AVAILABLE"] } }, data: { status: "FROZEN" } }),
    audit(affiliateId, "BLOCK", adminEmail, reason),
  ]);
}

/** Reversível: o que estava congelado volta a pendente ou disponível conforme a carência de cada comissão. */
export async function UnblockAffiliateService(affiliateId: string, adminEmail: string, now = new Date()) {
  const { count } = await prisma.user.updateMany({
    where: { id: affiliateId, affiliateStatus: "BLOCKED" },
    data: { affiliateStatus: "ACTIVE", affiliateBlockedAt: null, affiliateBlockReason: null },
  });
  if (count === 0) throw new BadRequestsException("Este afiliado não está bloqueado.", ErrorCode.INVALID_DATA);
  await prisma.$transaction([
    prisma.commission.updateMany({ where: { affiliateId, status: "FROZEN", availableAt: { lte: now } }, data: { status: "AVAILABLE" } }),
    prisma.commission.updateMany({ where: { affiliateId, status: "FROZEN", availableAt: { gt: now } }, data: { status: "PENDING" } }),
    audit(affiliateId, "UNBLOCK", adminEmail),
  ]);
}

/** Pagamento manual por Pix, feito fora do sistema: aqui só fica o registro. */
export async function SettleCommissionService(id: string, outcome: "PAID" | "CANCELED", adminEmail: string) {
  const commission = await prisma.commission.findUnique({ where: { id }, select: { affiliateId: true } });
  if (!commission) throw new NotFoundException("Comissão não encontrada.", ErrorCode.NOT_FOUND);
  // Pagar só o que já passou da carência ou foi congelado; cancelar vale também para a pendente.
  const from = outcome === "PAID" ? ["AVAILABLE", "FROZEN"] : ["PENDING", "AVAILABLE", "FROZEN"];
  const { count } = await prisma.commission.updateMany({
    where: { id, status: { in: from } },
    data: { status: outcome, paidAt: outcome === "PAID" ? new Date() : null },
  });
  if (count === 0) throw new BadRequestsException("Esta comissão não pode mais ser alterada.", ErrorCode.INVALID_DATA);
  await audit(commission.affiliateId, outcome === "PAID" ? "COMMISSION_PAID" : "COMMISSION_CANCELED", adminEmail, id);
}
