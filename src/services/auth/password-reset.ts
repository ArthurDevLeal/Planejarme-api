import { hash } from "bcrypt";
import crypto from "node:crypto";
import { prisma } from "../../../lib/prisma.ts";
import { BadRequestsException } from "../../exceptions/bad-requests.ts";
import { ErrorCode } from "../../exceptions/root.ts";
import { SendEmail } from "../../lib/email.ts";

const TOKEN_TTL_MS = 30 * 60 * 1000;

// Só o hash vai para o banco: um vazamento da tabela não permite redefinir senhas.
function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** RF02: gera um link de uso único. E-mail inexistente não gera erro, para não revelar contas. */
export async function RequestPasswordResetService(email: string) {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, email: true } });
  if (!user) return;

  const token = crypto.randomBytes(32).toString("base64url");
  await prisma.$transaction([
    prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }),
    prisma.passwordResetToken.create({
      data: { token: hashToken(token), userId: user.id, expiresAt: new Date(Date.now() + TOKEN_TTL_MS) },
    }),
  ]);

  const webUrl = (process.env.WEB_URL || "http://localhost:3000").replace(/\/$/, "");
  const link = `${webUrl}/auth/reset-password?token=${token}`;
  const firstName = user.name.split(" ")[0];

  // Falha de envio não muda a resposta: um 500 só para e-mails existentes revelaria a conta.
  await SendEmail({
    to: user.email,
    subject: "Redefinir sua senha do Planejar.me",
    text: `Olá, ${firstName}.\n\nPara criar uma nova senha, abra o link abaixo. Ele vale por 30 minutos e só pode ser usado uma vez.\n\n${link}\n\nSe você não pediu a troca, ignore este e-mail: sua senha atual continua valendo.`,
    html: `<p>Olá, ${escapeHtml(firstName)}.</p><p>Para criar uma nova senha, use o botão abaixo. O link vale por 30 minutos e só pode ser usado uma vez.</p><p><a href="${link}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#2563eb;color:#fff;text-decoration:none">Criar nova senha</a></p><p>Se você não pediu a troca, ignore este e-mail: sua senha atual continua valendo.</p>`,
  }).catch((error) => console.error("[password-reset] falha ao enviar e-mail", error));
}

export async function ResetPasswordService(token: string, password: string) {
  const record = await prisma.passwordResetToken.findUnique({ where: { token: hashToken(token) } });
  if (!record || record.expiresAt.getTime() < Date.now()) {
    throw new BadRequestsException(
      "O link de recuperação é inválido ou expirou. Peça um novo link.",
      ErrorCode.PASSWORD_RESET_TOKEN_EXPIRED,
    );
  }

  // Sessões JWT já emitidas continuam válidas até expirar (não há revogação de tokens).
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash: await hash(password, 8) } }),
    prisma.passwordResetToken.deleteMany({ where: { userId: record.userId } }),
  ]);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}
