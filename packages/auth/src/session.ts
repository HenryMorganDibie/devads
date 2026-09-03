import jwt from "jsonwebtoken";

export interface SessionPayload {
  sub: string; // user id
  role: "DEVELOPER" | "ADVERTISER" | "ADMIN";
}

const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export function signSession(payload: SessionPayload, secret: string, ttlSeconds = DEFAULT_TTL_SECONDS): string {
  return jwt.sign(payload, secret, { expiresIn: ttlSeconds, issuer: "devads" });
}

export function verifySession(token: string, secret: string): SessionPayload | null {
  try {
    const decoded = jwt.verify(token, secret, { issuer: "devads" });
    if (typeof decoded === "string") return null;
    if (typeof decoded.sub !== "string" || typeof decoded.role !== "string") return null;
    return { sub: decoded.sub, role: decoded.role as SessionPayload["role"] };
  } catch {
    return null;
  }
}
