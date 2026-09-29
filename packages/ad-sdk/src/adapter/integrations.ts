import type { DevClientType } from "../types.js";

/**
 * IMPLEMENTED:     a DevAds adapter for this client ships in this repository
 *                  and is covered by its tests.
 * NOT_IMPLEMENTED: the client type is a valid protocol value (a sponsor may
 *                  target it, and a third party may build an adapter that
 *                  sends it) but DevAds ships no adapter for it.
 */
export type IntegrationStatus = "IMPLEMENTED" | "NOT_IMPLEMENTED";

export interface ClientIntegration {
  status: IntegrationStatus;
  /** Repository path of the shipped adapter. Present only when IMPLEMENTED. */
  implementation?: string;
}

/**
 * The single, test-enforced record of which clients DevAds actually
 * integrates with. Listing a client type here is not a claim of support: only
 * IMPLEMENTED entries have an adapter, and no entry implies a partnership,
 * private API or official integration with the vendor of that tool. See
 * docs/adapters.md for what a legitimate adapter for each target would need.
 */
export const CLIENT_INTEGRATIONS: Readonly<Record<DevClientType, ClientIntegration>> = Object.freeze({
  VS_CODE: { status: "IMPLEMENTED", implementation: "apps/vscode-extension" },
  CLAUDE_CODE: { status: "NOT_IMPLEMENTED" },
  CODEX: { status: "NOT_IMPLEMENTED" },
  GEMINI: { status: "NOT_IMPLEMENTED" },
  CURSOR: { status: "NOT_IMPLEMENTED" },
  OPENCODE: { status: "NOT_IMPLEMENTED" },
  AIDER: { status: "NOT_IMPLEMENTED" },
  CUSTOM_AGENT: { status: "NOT_IMPLEMENTED" },
  LOCAL_AGENT: { status: "NOT_IMPLEMENTED" },
  OTHER: { status: "NOT_IMPLEMENTED" },
  // First-party: the DevAds web app is itself a protocol client (developer
  // beta dashboard) and talks to the core only through this SDK.
  WEB: { status: "IMPLEMENTED", implementation: "apps/web" },
});

export function isImplementedIntegration(clientType: DevClientType): boolean {
  return CLIENT_INTEGRATIONS[clientType]?.status === "IMPLEMENTED";
}
