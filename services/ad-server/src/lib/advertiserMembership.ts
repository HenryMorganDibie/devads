import { prisma } from "@devads/database";

/**
 * True if the signed-in user (req.session.sub) is a member of advertiserId.
 * Same check as the (module-private) helper in routes/campaigns.ts, kept as
 * its own module so the sponsorship routes can reuse it without touching
 * the existing ad-campaign routes.
 */
export async function isAdvertiserMember(userId: string, advertiserId: string): Promise<boolean> {
  const membership = await prisma.advertiserMember.findUnique({
    where: { advertiserId_userId: { advertiserId, userId } },
  });
  return membership !== null;
}
