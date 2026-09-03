import jwt from "jsonwebtoken";

const DEFAULT_TTL_SECONDS = 60 * 15; // 15 minutes

export function createMagicLinkToken(email: string, secret: string, ttlSeconds = DEFAULT_TTL_SECONDS): string {
  return jwt.sign({ email, purpose: "magic-link" }, secret, { expiresIn: ttlSeconds, issuer: "devads" });
}

export function verifyMagicLinkToken(token: string, secret: string): { email: string } | null {
  try {
    const decoded = jwt.verify(token, secret, { issuer: "devads" });
    if (typeof decoded === "string") return null;
    if (decoded.purpose !== "magic-link" || typeof decoded.email !== "string") return null;
    return { email: decoded.email };
  } catch {
    return null;
  }
}
