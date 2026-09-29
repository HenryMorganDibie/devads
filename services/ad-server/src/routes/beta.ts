import type { FastifyInstance } from "fastify";
import { Prisma, prisma } from "@devads/database";
import {
  BETA_TERMS_VERSION,
  JoinBetaRequestSchema,
  OAuthExchangeRequestSchema,
  type DevelopmentSessionListResponse,
  type DeveloperMeResponse,
  type OAuthExchangeResponse,
  type SponsorshipHistoryResponse,
} from "@devads/shared";
import { signSession } from "@devads/auth";
import { config } from "../lib/config.js";
import { requireSession } from "../lib/authGuard.js";
import { SESSION_SECRET } from "../lib/secrets.js";
import { isAllowedOAuthProvider, type IdentityVerifier } from "../lib/identity.js";

// Same budget as the password login and signup routes.
const AUTH_RATE_LIMIT = { rateLimit: { max: 10, timeWindow: "1 minute" } };

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

export interface BetaRouteOptions {
  /** Verifies OAuth access tokens; null disables OAuth sign-in (503). */
  identityVerifier: IdentityVerifier | null;
}

/**
 * Developer beta: OAuth sign-in into a DevAds developer account, beta
 * membership, and read-only views of the developer's own sessions and
 * sponsorship history. Every route below the exchange derives the developer
 * from the verified session, never from an id in the request.
 */
export async function registerBetaRoutes(app: FastifyInstance, opts: BetaRouteOptions) {
  const verifier = opts.identityVerifier;

  async function sessionFor(user: { id: string; role: string }, developerId: string, created: boolean) {
    const response: OAuthExchangeResponse = {
      token: signSession({ sub: user.id, role: user.role as "DEVELOPER" }, SESSION_SECRET),
      userId: user.id,
      developerId,
      created,
    };
    return response;
  }

  /**
   * POST /api/v1/auth/oauth/exchange
   *
   * Supabase access token in, DevAds session out. The identity comes only
   * from Supabase's answer. An identity is matched by its stable subject
   * (Supabase user id), never by email: if the email already belongs to a
   * different DevAds account the sign-in is refused rather than merged.
   */
  app.post("/api/v1/auth/oauth/exchange", { config: AUTH_RATE_LIMIT }, async (req, reply) => {
    if (!verifier) return reply.status(503).send({ error: "oauth_not_configured" });
    const parsed = OAuthExchangeRequestSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_request" });

    let identity;
    try {
      identity = await verifier.verify(parsed.data.accessToken);
    } catch {
      return reply.status(502).send({ error: "identity_provider_unavailable" });
    }
    if (!identity) return reply.status(401).send({ error: "invalid_oauth_token" });
    if (!isAllowedOAuthProvider(identity.provider)) {
      return reply.status(403).send({ error: "oauth_provider_not_allowed" });
    }
    if (!identity.email) return reply.status(400).send({ error: "oauth_email_required" });

    const findExisting = () =>
      prisma.user.findUnique({ where: { authSubject: identity.subject }, include: { developerProfile: true } });

    let user = await findExisting();
    let created = false;
    if (!user) {
      const emailOwner = await prisma.user.findUnique({ where: { email: identity.email } });
      // A concurrent first sign-in for this same identity may have just
      // created the account; only a *different* account's email is a conflict.
      if (emailOwner && emailOwner.authSubject !== identity.subject) {
        return reply.status(409).send({ error: "email_in_use_by_another_account" });
      }
      if (emailOwner) user = await findExisting();
    }
    if (!user) {
      try {
        user = await prisma.user.create({
          data: {
            email: identity.email,
            role: "DEVELOPER",
            authSubject: identity.subject,
            // Sponsorships are off until the developer opts in during onboarding.
            developerProfile: {
              create: { displayName: identity.displayName, adsEnabled: false, currency: config.platformDefaultCurrency },
            },
          },
          include: { developerProfile: true },
        });
        created = true;
      } catch (err) {
        // A concurrent first sign-in for the same identity won the race.
        if (!isUniqueViolation(err)) throw err;
        user = await findExisting();
        if (!user) return reply.status(409).send({ error: "email_in_use_by_another_account" });
      }
    }

    if (user.role !== "DEVELOPER") return reply.status(403).send({ error: "not_a_developer_account" });
    const developer =
      user.developerProfile ??
      (await prisma.developerProfile.create({
        data: { userId: user.id, displayName: identity.displayName, adsEnabled: false, currency: config.platformDefaultCurrency },
      }));
    return reply.send(await sessionFor(user, developer.id, created));
  });

  async function currentDeveloper(userId: string) {
    return prisma.developerProfile.findUnique({ where: { userId }, include: { user: true } });
  }

  async function toMe(developer: NonNullable<Awaited<ReturnType<typeof currentDeveloper>>>): Promise<DeveloperMeResponse> {
    const installations = await prisma.clientInstallation.findMany({
      where: { userId: developer.userId },
      orderBy: { lastSeenAt: "desc" },
      take: 10,
    });
    return {
      developerId: developer.id,
      email: developer.user.email,
      displayName: developer.displayName,
      sponsorshipsEnabled: developer.adsEnabled,
      betaJoinedAt: developer.betaJoinedAt?.toISOString() ?? null,
      betaTermsVersion: developer.betaTermsVersion,
      currentBetaTermsVersion: BETA_TERMS_VERSION,
      clientInstallations: installations.map((i) => ({
        platform: i.platform,
        extensionVersion: i.extensionVersion,
        lastSeenAt: i.lastSeenAt.toISOString(),
      })),
    };
  }

  /** GET /api/v1/me/developer: the signed-in developer's own profile and beta status. */
  app.get("/api/v1/me/developer", { preHandler: requireSession }, async (req, reply) => {
    const developer = await currentDeveloper(req.session!.sub);
    if (!developer) return reply.status(404).send({ error: "developer_not_found" });
    return reply.send(await toMe(developer));
  });

  /**
   * POST /api/v1/me/beta: join the developer beta by accepting the current
   * terms. Idempotent: the original join time is kept on repeat calls.
   */
  app.post("/api/v1/me/beta", { preHandler: requireSession }, async (req, reply) => {
    const parsed = JoinBetaRequestSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_request" });
    const developer = await currentDeveloper(req.session!.sub);
    if (!developer) return reply.status(404).send({ error: "developer_not_found" });

    const updated = await prisma.developerProfile.update({
      where: { id: developer.id },
      data: { betaJoinedAt: developer.betaJoinedAt ?? new Date(), betaTermsVersion: parsed.data.termsVersion },
      include: { user: true },
    });
    return reply.send(await toMe(updated));
  });

  /** GET /api/v1/sessions: the signed-in developer's recent development sessions. */
  app.get("/api/v1/sessions", { preHandler: requireSession }, async (req, reply) => {
    const developer = await currentDeveloper(req.session!.sub);
    if (!developer) return reply.status(404).send({ error: "developer_not_found" });
    const sessions = await prisma.developmentSession.findMany({
      where: { developerId: developer.id },
      orderBy: { startedAt: "desc" },
      take: 25,
      include: { _count: { select: { events: true } } },
    });
    const response: DevelopmentSessionListResponse = {
      sessions: sessions.map((s) => ({
        id: s.id,
        clientType: s.clientType,
        clientVersion: s.clientVersion,
        status: s.status,
        startedAt: s.startedAt.toISOString(),
        endedAt: s.endedAt?.toISOString() ?? null,
        interactions: s._count.events,
      })),
    };
    return reply.send(response);
  });

  /** GET /api/v1/me/sponsorship-history: the signed-in developer's recent sponsorship events. */
  app.get("/api/v1/me/sponsorship-history", { preHandler: requireSession }, async (req, reply) => {
    const developer = await currentDeveloper(req.session!.sub);
    if (!developer) return reply.status(404).send({ error: "developer_not_found" });
    const events = await prisma.sponsorshipEvent.findMany({
      where: { developerId: developer.id },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { offer: true, campaign: true },
    });
    const response: SponsorshipHistoryResponse = {
      events: events.map((e) => ({
        eventId: e.eventId,
        type: e.type,
        offerTitle: e.offer.title,
        campaignMode: e.campaign.mode,
        rewardType: e.campaign.rewardType,
        rewardAmountUnits: e.campaign.rewardAmountUnits,
        createdAt: e.createdAt.toISOString(),
      })),
    };
    return reply.send(response);
  });
}
