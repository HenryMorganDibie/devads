/**
 * The ONLY place the SDK knows ad-server HTTP paths. Internal: not exported
 * from the package entry point, so adapters built on DevAdsClient never
 * depend on endpoint paths. Mirrors services/ad-server/src/routes/sponsorships.ts and redemptions.ts.
 */
export const ROUTES = {
  startSession: { method: "POST", path: () => "/api/v1/sessions" },
  endSession: { method: "POST", path: (sessionId: string) => `/api/v1/sessions/${encodeURIComponent(sessionId)}/end` },
  requestOffer: { method: "GET", path: () => "/api/v1/sponsorships/offer" },
  listOffers: { method: "GET", path: () => "/api/v1/sponsorships/offers" },
  reportEvent: { method: "POST", path: () => "/api/v1/sponsorships/events" },
  wallet: { method: "GET", path: () => "/api/v1/wallet" },
  listRedemptions: { method: "GET", path: () => "/api/v1/wallet/redemptions" },
  redeem: { method: "POST", path: () => "/api/v1/wallet/redemptions" },
} as const;
