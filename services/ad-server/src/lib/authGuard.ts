import type { FastifyReply, FastifyRequest } from "fastify";
import { verifySession, type SessionPayload } from "@devads/auth";

const SESSION_SECRET = process.env.SESSION_SECRET ?? "dev-only-session-secret-change-me-please-32chars";

declare module "fastify" {
  interface FastifyRequest {
    session?: SessionPayload;
  }
}

function extractBearerToken(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length);
}

/** Attaches req.session if a valid bearer token is present; does not reject if absent. */
export async function attachSession(req: FastifyRequest, _reply: FastifyReply) {
  const token = extractBearerToken(req);
  if (!token) return;
  const session = verifySession(token, SESSION_SECRET);
  if (session) req.session = session;
}

/** Rejects unless a valid session is present. */
export async function requireSession(req: FastifyRequest, reply: FastifyReply) {
  if (!req.session) {
    return reply.status(401).send({ error: "unauthorized" });
  }
}

/** Rejects unless a valid ADMIN session is present. */
export async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  if (!req.session || req.session.role !== "ADMIN") {
    return reply.status(403).send({ error: "forbidden" });
  }
}
