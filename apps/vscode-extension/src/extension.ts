import * as vscode from "vscode";
import { randomUUID } from "node:crypto";
import { CommandTracker } from "./commandTracker";
import { isEligibleForAdRequest } from "./eligibility";
import { AdClient, type AdCandidate } from "./adClient";
import { StatusBarAd } from "./statusBarAd";
import { buildContext, coarseCommandName } from "./contextDetect";
import { getDeveloperId, getSessionToken, signIn, signOut } from "./auth";
import { createSponsorshipClient } from "./sponsorshipClient";
import { SponsorshipSession } from "./sponsorshipSession";
import { SponsoredOfferController } from "./sponsoredOffer";
import {
  offerLabel,
  OPEN_OFFER_COMMAND,
  SHOW_OFFER_COMMAND,
  SKIP_OFFER_COMMAND,
  StatusBarSponsoredOffer,
} from "./statusBarSponsoredOffer";
import { OfferPresentationController, parsePresentationPreference } from "./offerPresentation";
import { WebviewOfferPanel } from "./offerPanel";
import { WaitEstimator } from "./waitEstimator";
import { loadWallet } from "./rewardWallet";

const POLL_INTERVAL_MS = 1000;
const INSTALLATION_ID_KEY = "devads.installationId";
const WAIT_HISTORY_KEY = "devads.waitHistory";

// Held at module scope only so deactivate() can end the sponsorship session.
let activeSponsorshipSession: SponsorshipSession | undefined;

function readConfig() {
  const cfg = vscode.workspace.getConfiguration("devads");
  return {
    enabled: cfg.get<boolean>("enabled", true),
    minimumWaitSeconds: cfg.get<number>("minimumWaitSeconds", 8),
    adServerUrl: cfg.get<string>("adServerUrl", "http://localhost:4000"),
    webAppUrl: cfg.get<string>("webAppUrl", "http://localhost:3000"),
    telemetryEnabled: cfg.get<boolean>("telemetryEnabled", true),
    sponsorshipEnabled: cfg.get<boolean>("sponsorship.enabled", true),
    sponsorshipPresentation: parsePresentationPreference(cfg.get<string>("sponsorship.presentation", "panel")),
    sponsorshipVideoEnabled: cfg.get<boolean>("sponsorship.video.enabled", true),
  };
}

export function activate(context: vscode.ExtensionContext) {
  let installationId = context.globalState.get<string>(INSTALLATION_ID_KEY);
  if (!installationId) {
    installationId = randomUUID();
    void context.globalState.update(INSTALLATION_ID_KEY, installationId);
  }

  const trackers = new Map<vscode.Terminal, CommandTracker>();
  const statusBar = new StatusBarAd(
    (ad) => void handleAdClick(ad),
    (ad) => void handleAdDismiss(ad)
  );
  context.subscriptions.push(statusBar);

  // --- Sponsorship (DevAds Protocol via @devads/ad-sdk) ------------------
  // A separate, optional path next to the standard ad flow above. Every
  // piece of it is failure-tolerant: if the sponsorship API is unreachable
  // or rejects, only sponsored offers are missing; standard ads, commands
  // and activation are unaffected.
  const sponsorshipLog = vscode.window.createOutputChannel("DevAds Sponsorship");
  context.subscriptions.push(sponsorshipLog);
  const log = (message: string) => sponsorshipLog.appendLine(`[${new Date().toISOString()}] ${message}`);
  const extensionVersion = (context.extension.packageJSON as { version?: string } | undefined)?.version;
  const getSponsorshipClient = () =>
    createSponsorshipClient({
      adServerUrl: readConfig().adServerUrl,
      extensionVersion,
      getToken: () => getSessionToken(context),
      getDeveloperId: () => getDeveloperId(context),
    });
  const sponsorshipSession = new SponsorshipSession(getSponsorshipClient, log);
  activeSponsorshipSession = sponsorshipSession;
  // Presentation: the DevAds offer panel first (any presentation mode), the
  // existing status bar item as the compact mode and the fallback.
  const sponsoredOfferStatusBar = new StatusBarSponsoredOffer();
  context.subscriptions.push(sponsoredOfferStatusBar);
  const sponsoredOfferView = new OfferPresentationController({
    statusBar: sponsoredOfferStatusBar,
    createPanel: (events) =>
      new WebviewOfferPanel(
        {
          open: (offer) => void sponsoredOffers.open(offer),
          // Act only on the offer still current, like the status bar's Skip.
          skip: (offer) => {
            if (sponsoredOffers.getCurrent()?.displayEventId === offer.displayEventId) void sponsoredOffers.skip();
          },
          log,
        },
        events
      ),
    preference: () => readConfig().sponsorshipPresentation,
    videoAllowed: () => readConfig().sponsorshipVideoEnabled,
    log,
  });
  context.subscriptions.push(sponsoredOfferView);
  // Local-only command timing history (SHA-256 keyed, never the command
  // text), backing the terminal wait's availableSeconds() estimate.
  const waitEstimator = new WaitEstimator({
    get: () => context.workspaceState.get<Record<string, number[]>>(WAIT_HISTORY_KEY) ?? {},
    set: (value) => void context.workspaceState.update(WAIT_HISTORY_KEY, value),
  });
  const sponsoredOffers: SponsoredOfferController = new SponsoredOfferController({
    getClient: getSponsorshipClient,
    session: sponsorshipSession,
    view: sponsoredOfferView,
    openExternal: async (url) => vscode.env.openExternal(vscode.Uri.parse(url)),
    notify: (message) => void vscode.window.showInformationMessage(message),
    log,
  });

  async function startSponsorshipSessionIfReady() {
    const config = readConfig();
    if (!config.enabled || !config.sponsorshipEnabled) return;
    if (!getDeveloperId(context) || !(await getSessionToken(context))) return;
    await sponsorshipSession.start();
  }
  void startSponsorshipSessionIfReady();

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration("devads.sponsorship.enabled") && !e.affectsConfiguration("devads.enabled")) return;
      const config = readConfig();
      if (config.enabled && config.sponsorshipEnabled) {
        void startSponsorshipSessionIfReady();
      } else {
        sponsoredOffers.onCommandEnd();
        void sponsorshipSession.end();
      }
    })
  );

  let pollTimer: ReturnType<typeof setInterval> | undefined;

  async function getClient(): Promise<AdClient> {
    const token = await getSessionToken(context);
    return new AdClient(readConfig().adServerUrl, token);
  }

  async function handleAdClick(ad: AdCandidate) {
    const developerId = getDeveloperId(context);
    if (developerId) {
      const client = await getClient();
      void client.reportEvent({
        eventId: randomUUID(),
        type: "CLICK",
        campaignId: ad.campaignId,
        impressionId: ad.impressionId,
        developerId,
      });
    }
    void vscode.env.openExternal(vscode.Uri.parse(ad.ctaUrl));
    statusBar.hide();
  }

  async function handleAdDismiss(ad: AdCandidate) {
    const developerId = getDeveloperId(context);
    if (developerId) {
      const client = await getClient();
      void client.reportEvent({
        eventId: randomUUID(),
        type: "DISMISS",
        campaignId: ad.campaignId,
        impressionId: ad.impressionId,
        developerId,
      });
    }
    statusBar.hide();
  }

  async function reportViewCompleteIfShown() {
    const ad = statusBar.getCurrent();
    if (!ad) return;
    const developerId = getDeveloperId(context);
    const viewDurationMs = statusBar.viewDurationMs();
    statusBar.hide();
    if (!developerId) return;
    const client = await getClient();
    void client.reportEvent({
      eventId: randomUUID(),
      type: "VIEW_COMPLETE",
      campaignId: ad.campaignId,
      impressionId: ad.impressionId,
      developerId,
      viewDurationMs,
    });
  }

  async function tick() {
    const config = readConfig();
    const developerId = getDeveloperId(context);
    const token = await getSessionToken(context);
    const isSignedIn = Boolean(developerId && token);

    for (const [, tracker] of trackers) {
      const eligible = isEligibleForAdRequest(
        { enabled: config.enabled, minimumWaitSeconds: config.minimumWaitSeconds },
        {
          isSignedIn,
          elapsedSeconds: tracker.elapsedSeconds(),
          alreadyRequestedForThisCommand: false,
          stillRunning: tracker.isStillRunning(),
        }
      );
      if (!eligible || !tracker.shouldRequestAd()) continue;

      tracker.markAdRequested();
      if (!developerId) continue;

      const detected = buildContext();
      const client = await getClient();
      const ad = await client.selectAd({
        developerId,
        installationId,
        command: config.telemetryEnabled ? coarseCommandName(tracker.currentCommand() ?? "") : undefined,
        language: config.telemetryEnabled ? detected.language : undefined,
        runtime: config.telemetryEnabled ? detected.runtime : undefined,
        platform: config.telemetryEnabled ? detected.platform : undefined,
        elapsedSeconds: tracker.elapsedSeconds(),
      });

      // Only show it if the command is STILL running by the time the
      // (network) response comes back -- never show an ad after the
      // developer's wait is already over.
      if (ad && tracker.isStillRunning()) {
        statusBar.show(ad);
      }
    }

    // Sponsored offers: same wait signal, read-only use of the trackers,
    // after the standard flow has had its turn. maybeRequest never throws.
    if (config.enabled && config.sponsorshipEnabled) {
      // The wait reports available seconds (making VIDEO possible) only when
      // the panel can play it: panel presentation, video on, and a command
      // to estimate. Otherwise the request is exactly the CARD-only one.
      const canPlayVideo = config.sponsorshipPresentation === "panel" && config.sponsorshipVideoEnabled;
      for (const [, tracker] of trackers) {
        const command = tracker.currentCommand();
        await sponsoredOffers.maybeRequest(tracker, {
          enabled: true,
          minimumWaitSeconds: config.minimumWaitSeconds,
          isSignedIn,
          standardAdShowing: statusBar.getCurrent() !== null,
          availableSeconds:
            canPlayVideo && command ? () => waitEstimator.availableSeconds(command, tracker.elapsedSeconds()) : undefined,
        });
      }
    }
  }

  function ensurePolling() {
    if (pollTimer) return;
    pollTimer = setInterval(() => void tick(), POLL_INTERVAL_MS);
    context.subscriptions.push({ dispose: () => pollTimer && clearInterval(pollTimer) });
  }

  // --- Terminal shell execution lifecycle (graceful no-op if the host
  // doesn't support shell integration -- these APIs simply won't fire). ---
  const shellApi = vscode.window as unknown as {
    onDidStartTerminalShellExecution?: (
      listener: (e: { terminal: vscode.Terminal; execution: { commandLine: { value: string } } }) => void
    ) => vscode.Disposable;
    onDidEndTerminalShellExecution?: (listener: (e: { terminal: vscode.Terminal }) => void) => vscode.Disposable;
  };

  if (shellApi.onDidStartTerminalShellExecution && shellApi.onDidEndTerminalShellExecution) {
    context.subscriptions.push(
      shellApi.onDidStartTerminalShellExecution((e) => {
        let tracker = trackers.get(e.terminal);
        if (!tracker) {
          tracker = new CommandTracker(readConfig().minimumWaitSeconds * 1000);
          trackers.set(e.terminal, tracker);
        }
        tracker.onCommandStart(e.execution.commandLine.value);
        sponsoredOffers.onCommandStart(tracker);
        ensurePolling();
      })
    );

    context.subscriptions.push(
      shellApi.onDidEndTerminalShellExecution((e) => {
        const tracker = trackers.get(e.terminal);
        // Learn this command's duration (stored locally, hashed) for future
        // estimates, only while that estimate can be used (video in the panel).
        const config = readConfig();
        const learning =
          config.enabled &&
          config.sponsorshipEnabled &&
          config.sponsorshipPresentation === "panel" &&
          config.sponsorshipVideoEnabled;
        const finished = learning && tracker?.isStillRunning() ? tracker.currentCommand() : null;
        if (tracker && finished) waitEstimator.record(finished, tracker.elapsedSeconds());
        tracker?.onCommandEnd();
        void reportViewCompleteIfShown();
        sponsoredOffers.onCommandEnd();
      })
    );

    context.subscriptions.push(
      vscode.window.onDidCloseTerminal((terminal) => {
        trackers.delete(terminal);
      })
    );
  } else {
    void vscode.window.showInformationMessage(
      "DevAds: this terminal doesn't support shell integration, so sponsored cards are disabled here."
    );
  }

  // --- Commands ---------------------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand("devads.signIn", async () => {
      const signedIn = await signIn(context, readConfig().adServerUrl);
      if (signedIn) void startSponsorshipSessionIfReady();
      return signedIn;
    }),
    vscode.commands.registerCommand("devads.signOut", async () => {
      // End the sponsorship session while the token still exists.
      sponsoredOffers.onCommandEnd();
      await sponsorshipSession.end();
      return signOut(context);
    }),
    vscode.commands.registerCommand("devads.enable", () =>
      vscode.workspace.getConfiguration("devads").update("enabled", true, vscode.ConfigurationTarget.Global)
    ),
    vscode.commands.registerCommand("devads.disable", () => {
      statusBar.hide();
      return vscode.workspace.getConfiguration("devads").update("enabled", false, vscode.ConfigurationTarget.Global);
    }),
    vscode.commands.registerCommand("devads.openDashboard", () =>
      vscode.env.openExternal(vscode.Uri.parse(readConfig().webAppUrl + "/dashboard"))
    ),
    vscode.commands.registerCommand("devads.showStatus", () => {
      const developerId = getDeveloperId(context);
      void vscode.window.showInformationMessage(
        developerId ? "DevAds: signed in and " + (readConfig().enabled ? "enabled." : "disabled.") : "DevAds: not signed in."
      );
    }),
    vscode.commands.registerCommand("devads.adClicked", () => {
      const ad = statusBar.getCurrent();
      if (ad) void handleAdClick(ad);
    }),
    vscode.commands.registerCommand("devads.adDismissed", () => {
      const ad = statusBar.getCurrent();
      if (ad) void handleAdDismiss(ad);
    }),
    vscode.commands.registerCommand(SHOW_OFFER_COMMAND, async () => {
      const offer = sponsoredOffers.getCurrent();
      if (!offer) return;
      void sponsoredOffers.interact();
      const view = "View offer";
      const skip = "Skip";
      const choice = await vscode.window.showInformationMessage(
        `${offerLabel(offer)}: ${offer.title}. ${offer.description}`,
        view,
        skip
      );
      if (choice === view) await sponsoredOffers.open(offer);
      else if (choice === skip && sponsoredOffers.getCurrent()?.displayEventId === offer.displayEventId) {
        await sponsoredOffers.skip();
      }
    }),
    vscode.commands.registerCommand(OPEN_OFFER_COMMAND, () => sponsoredOffers.open()),
    vscode.commands.registerCommand(SKIP_OFFER_COMMAND, () => sponsoredOffers.skip()),
    vscode.commands.registerCommand("devads.showRewardWallet", async () => {
      const isSignedIn = Boolean(getDeveloperId(context) && (await getSessionToken(context)));
      const result = await loadWallet(getSponsorshipClient(), isSignedIn);
      if (!result.ok) {
        void vscode.window.showWarningMessage(result.message);
        return;
      }
      if (result.lines.length === 0) {
        void vscode.window.showInformationMessage("DevAds: your reward wallet is empty so far.");
        return;
      }
      await vscode.window.showQuickPick(
        result.lines.map((line) => ({ label: line.label, description: line.detail })),
        { title: "DevAds Reward Wallet", placeHolder: "Available and pending reward units by type" }
      );
    })
  );
}

export function deactivate(): Promise<void> | undefined {
  // Nothing to persist -- session lives in SecretStorage, timers are
  // disposed via context.subscriptions. The only work is closing the
  // sponsorship session, which never throws.
  const session = activeSponsorshipSession;
  activeSponsorshipSession = undefined;
  return session?.end();
}
