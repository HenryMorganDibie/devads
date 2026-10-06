// DevAds adapter runtime: the host-agnostic half of every DevAds client.
//
// A client adapter (an editor extension, a CLI, an agent integration)
// implements AdapterHost for its own UI and supplies WaitHandles for waits it
// can already observe. Sessions, the offer lifecycle, event correlation,
// the completion policy and failure handling live here, so adding a client
// never touches the sponsorship core, reward accounting or this runtime.

export { DevelopmentSessionManager } from "./session.js";
export { SponsoredOfferRuntime, type SponsoredOfferRuntimeDeps } from "./offerRuntime.js";
export { canClaimCompletionOnOpen, formatReward, rewardLabel } from "./rewards.js";
export { firstPartyOfferUrl } from "./links.js";
export { describeError, isRetryableCompletionError, isStaleSessionError } from "./errors.js";
export {
  CLIENT_INTEGRATIONS,
  isImplementedIntegration,
  type ClientIntegration,
  type IntegrationStatus,
} from "./integrations.js";
export type { AdapterHost, ProtocolClient, ProtocolClientProvider, SessionProvider, WaitHandle } from "./types.js";
