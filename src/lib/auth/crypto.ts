import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** URL-safe random token and its hash (only the hash is stored). */
export function newToken(bytes = 32): { token: string; hash: string } {
  const token = randomBytes(bytes).toString("base64url");
  return { token, hash: sha256(token) };
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
