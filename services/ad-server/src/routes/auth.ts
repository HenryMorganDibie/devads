import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@devads/database";
import { LoginSchema, SignupSchema } from "@devads/shared";
import {
  generateDeviceCode,
  generateUserCode,
  hashPassword,
  signSession,
  verifyPassword,
} from "@devads/auth";
import { config } from "../lib/config.js";

const SESSION_SECRET = process.env.SESSION_SECRET ?? "dev-only-session-secret-change-me-please-32chars";
const DEVICE_CODE_TTL_SECONDS = Number(process.env.DEVICE_AUTH_CODE_TTL_SECONDS ?? 600);

const DeviceAuthStartBody = z.object({
  platform: z.string().max(32).optional(),
  extensionVersion: z.string().max(32).optional(),
});

const DeviceAuthPollBody = z.object({
  deviceCode: z.string().min(1),
});

const DeviceAuthApproveBody = z.object({
  userCode: z.string().min(1),
  userId: z.string().min(1),
});

/**
 * Developer signup/login (email+password) and magic-link, plus the
 * VS Code extension device-pairing flow. Kept in the ad-server so every
 * client (extension, future CLI, the web dashboards) authenticates against
 * one service rather than duplicating session logic per app.
 */
export async function registerAuthRoutes(app: FastifyInstance) {
  app.post("/api/v1/auth/signup", async (req, reply) => {
    const parsed = SignupSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    const { email, password, role } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return reply.status(409).send({ error: "email_already_registered" });

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: hashPassword(password),
        role,
        developerProfile: role === "DEVELOPER" ? { create: { currency: config.platformDefaultCurrency } } : undefined,
      },
      include: { developerProfile: true },
    });

    const token = signSession({ sub: user.id, role: user.role }, SESSION_SECRET);
    return reply.send({ token, userId: user.id, developerId: user.developerProfile?.id ?? null });
  });

  app.post("/api/v1/auth/login", async (req, reply) => {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { email },
      include: { developerProfile: true, advertiserMemberships: true },
    });
    if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
      return reply.status(401).send({ error: "invalid_credentials" });
    }

    const token = signSession({ sub: user.id, role: user.role }, SESSION_SECRET);
    return reply.send({
      token,
      userId: user.id,
      developerId: user.developerProfile?.id ?? null,
      advertiserId: user.advertiserMemberships[0]?.advertiserId ?? null,
    });
  });

  app.post("/api/v1/auth/admin-login", async (req, reply) => {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_request" });
    const { email, password } = parsed.data;

    const admin = await prisma.adminUser.findUnique({ where: { email } });
    if (!admin || !verifyPassword(password, admin.passwordHash)) {
      return reply.status(401).send({ error: "invalid_credentials" });
    }

    const token = signSession({ sub: admin.id, role: "ADMIN" }, SESSION_SECRET);
    return reply.send({ token, adminId: admin.id });
  });

  // --- Device-pairing flow used by the VS Code extension --------------------
  app.post("/api/v1/auth/device/start", async (req, reply) => {
    const parsed = DeviceAuthStartBody.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_request" });

    const deviceCode = generateDeviceCode();
    const userCode = generateUserCode();
    const expiresAt = new Date(Date.now() + DEVICE_CODE_TTL_SECONDS * 1000);

    await prisma.deviceAuthRequest.create({
      data: {
        deviceCode,
        userCode,
        platform: parsed.data.platform,
        extensionVersion: parsed.data.extensionVersion,
        expiresAt,
      },
    });

    return reply.send({
      deviceCode,
      userCode,
      verificationUrl: `${process.env.WEB_APP_URL ?? "http://localhost:3000"}/device`,
      expiresInSeconds: DEVICE_CODE_TTL_SECONDS,
      pollIntervalSeconds: 3,
    });
  });

  app.post("/api/v1/auth/device/poll", async (req, reply) => {
    const parsed = DeviceAuthPollBody.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_request" });

    const request = await prisma.deviceAuthRequest.findUnique({ where: { deviceCode: parsed.data.deviceCode } });
    if (!request) return reply.status(404).send({ error: "not_found" });

    if (request.status === "PENDING" && request.expiresAt < new Date()) {
      await prisma.deviceAuthRequest.update({ where: { id: request.id }, data: { status: "EXPIRED" } });
      return reply.send({ status: "expired", token: null });
    }

    if (request.status === "APPROVED" && request.userId) {
      const user = await prisma.user.findUnique({ where: { id: request.userId }, include: { developerProfile: true } });
      if (!user) return reply.send({ status: "expired", token: null });
      const token = signSession({ sub: user.id, role: user.role }, SESSION_SECRET);
      return reply.send({ status: "approved", token, developerId: user.developerProfile?.id ?? null });
    }

    return reply.send({ status: request.status.toLowerCase(), token: null, developerId: null });
  });

  // Called by the web app (after the developer signs in and enters the user
  // code shown in VS Code) to approve a pending device request.
  app.post("/api/v1/auth/device/approve", async (req, reply) => {
    const parsed = DeviceAuthApproveBody.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_request" });

    const request = await prisma.deviceAuthRequest.findUnique({ where: { userCode: parsed.data.userCode } });
    if (!request || request.status !== "PENDING" || request.expiresAt < new Date()) {
      return reply.status(400).send({ error: "invalid_or_expired_code" });
    }

    await prisma.deviceAuthRequest.update({
      where: { id: request.id },
      data: { status: "APPROVED", userId: parsed.data.userId, approvedAt: new Date() },
    });

    return reply.send({ ok: true });
  });
}
