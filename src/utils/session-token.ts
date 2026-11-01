import jwt from "jsonwebtoken";

/** Token de sessão da API (RNF03); o mesmo para login com senha e com Google/GitHub. */
export function signSessionToken(userId: string) {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET!, { expiresIn: "7d" });
}
