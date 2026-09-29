#!/usr/bin/env node
// Walks the sponsorship loop end to end against a running ad-server, through
// the same @devads/ad-sdk boundary any client adapter uses:
//
//   sponsor campaign -> developer opt-in -> sponsored offer -> qualifying
//   interaction -> server verification -> sponsor charge -> developer reward
//   -> wallet
//
// It then replays the completion to show it is neither re-rewarded nor
// re-charged. Uses the seeded demo accounts and campaigns (`npm run demo`),
// which target the VS_CODE client type, and needs no AI-provider account.
//
//   npm run demo:sponsorship            # AD_SERVER_URL defaults to http://localhost:4000
import { DevAdsClient } from "@devads/ad-sdk";

const BASE = (process.env.AD_SERVER_URL ?? "http://localhost:4000").replace(/\/+$/, "");
const DEVELOPER = { email: "dev@devads.dev", password: "dev12345" };
const SPONSOR = { email: "advertiser@devads.dev", password: "advertiser12345" };

const step = (n, text) => console.log(`\n${String(n).padStart(2, "0")}  ${text}`);
const detail = (text) => console.log(`    ${text}`);
const usd = (cents) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function api(path, { token, method = "GET", body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(data)}`);
  return data;
}

async function sponsorCampaigns(sponsor) {
  return api(`/api/v1/sponsorship-campaigns?advertiserId=${sponsor.advertiserId}`, { token: sponsor.token });
}

async function main() {
  try {
    await api("/health");
  } catch {
    console.error(`No ad-server at ${BASE}. Run \`npm run demo\`, then \`npm run dev -w @devads/ad-server\`.`);
    process.exit(1);
  }

  console.log(`DevAds sponsorship loop demo against ${BASE}`);
  console.log("All sponsors, offers and amounts are fictional seed data.");

  const sponsor = await api("/api/v1/auth/login", { method: "POST", body: SPONSOR });
  const before = await sponsorCampaigns(sponsor);
  const live = before.filter((c) => c.status === "APPROVED");
  if (live.length === 0) throw new Error("No APPROVED sponsorship campaign. Run `npm run db:seed` first.");

  step(1, "A sponsor funds campaigns");
  for (const c of live) {
    const budget = c.totalBudgetCents == null ? "no total cap" : `${usd(c.totalBudgetCents)} budget`;
    detail(`${c.name}: ${budget}, pays ${usd(c.sponsorChargeCents)} per verified completion, rewards ${c.rewardAmountUnits} ${c.rewardType} units`);
  }

  const dev = await api("/api/v1/auth/login", { method: "POST", body: DEVELOPER });
  const devads = new DevAdsClient({ baseUrl: BASE, credentials: { token: dev.token, developerId: dev.developerId } });

  step(2, "A developer opts in and starts a session from a client");
  // The seeded demo campaigns target VS_CODE, so the script reports that
  // client type. It is a label a sponsor can target, nothing more.
  const session = await devads.startSession({ clientType: "VS_CODE", clientVersion: "demo-script" });
  detail(`session ${session.id} (client type ${session.clientType}); only coarse metadata is sent, never code or prompts`);

  step(3, "DevAds selects an eligible sponsored opportunity");
  const offer = await devads.requestSponsoredOpportunity({ sessionId: session.id });
  if (!offer) {
    detail("No eligible offer right now (caps or budgets reached). Re-seed, or try again tomorrow (UTC).");
    await devads.endSession(session.id);
    return;
  }
  detail(`"${offer.title}" -> ${offer.rewardAmountUnits} ${offer.rewardType} units`);
  detail(`server-issued display ${offer.displayEventId}`);

  step(4, "The developer chooses to engage");
  await devads.reportOfferEvent({ type: "OFFER_OPENED", displayEventId: offer.displayEventId, sessionId: session.id });
  detail(`opened; required action: ${offer.requiredAction ?? "complete the offer"}`);

  step(5, "The client reports the qualifying action; DevAds verifies it server-side");
  const completion = await devads.completeQualifyingAction({ displayEventId: offer.displayEventId, sessionId: session.id });
  detail(`verified: rewarded=${completion.rewarded}; amount and type came from the campaign, not the client`);

  const after = await sponsorCampaigns(sponsor);
  const campaignBefore = before.find((c) => c.id === offer.campaignId);
  const campaignAfter = after.find((c) => c.id === offer.campaignId);
  step(6, "The sponsor is charged according to the campaign");
  detail(`${campaignAfter.name}: spend ${usd(campaignBefore.stats.spendCents)} -> ${usd(campaignAfter.stats.spendCents)}`);

  step(7, "The developer receives the reward");
  detail(`${completion.reward.amountUnits} ${completion.reward.rewardType} units, status ${completion.reward.status}`);

  step(8, "The reward appears in the developer's wallet");
  const wallet = await devads.getWallet();
  for (const b of wallet.balances) detail(`${b.rewardType}: ${b.availableUnits} available (ledger total ${b.ledgerAvailableUnits})`);

  step(9, "DevAds earns its platform fee");
  detail("The sponsor's charge covers the developer reward and the platform fee; reward units and");
  detail("sponsor cents are configured independently per campaign, with no fixed conversion.");

  console.log("\nSafety check: replaying the same completion");
  const replay = await devads.completeQualifyingAction({
    displayEventId: offer.displayEventId,
    sessionId: session.id,
    eventId: completion.eventId,
  });
  const walletAgain = await devads.getWallet();
  const spendAgain = (await sponsorCampaigns(sponsor)).find((c) => c.id === offer.campaignId).stats.spendCents;
  const unchanged =
    JSON.stringify(walletAgain.balances) === JSON.stringify(wallet.balances) &&
    spendAgain === campaignAfter.stats.spendCents;
  detail(`idempotent=${Boolean(replay.idempotent)}; wallet and sponsor spend unchanged: ${unchanged}`);

  await devads.endSession(session.id);
  console.log("\nDone. The session is ended.");
  if (!unchanged) process.exit(1);
}

main().catch((err) => {
  console.error(`\nDemo failed: ${err.message}`);
  process.exit(1);
});
