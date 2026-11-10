import jwt from "jsonwebtoken";

export function signSessionToken(userId: string) {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET!, { expiresIn: "7d" });
}
