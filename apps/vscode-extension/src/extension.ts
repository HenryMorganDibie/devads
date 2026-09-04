import * as vscode from "vscode";
import { randomUUID } from "node:crypto";
import { CommandTracker } from "./commandTracker";
import { isEligibleForAdRequest } from "./eligibility";
import { AdClient, type AdCandidate } from "./adClient";
import { StatusBarAd } from "./statusBarAd";
import { buildContext, coarseCommandName } from "./contextDetect";
import { getDeveloperId, getSessionToken, signIn, signOut } from "./auth";

const POLL_INTERVAL_MS = 1000;
const INSTALLATION_ID_KEY = "devads.installationId";

function readConfig() {
  const cfg = vscode.workspace.getConfiguration("devads");
  return {
    enabled: cfg.get<boolean>("enabled", true),
    minimumWaitSeconds: cfg.get<number>("minimumWaitSeconds", 8),
    adServerUrl: cfg.get<string>("adServerUrl", "http://localhost:4000"),
    webAppUrl: cfg.get<string>("webAppUrl", "http://localhost:3000"),
    telemetryEnabled: cfg.get<boolean>("telemetryEnabled", true),
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
        ensurePolling();
      })
    );

    context.subscriptions.push(
      shellApi.onDidEndTerminalShellExecution((e) => {
        const tracker = trackers.get(e.terminal);
        tracker?.onCommandEnd();
        void reportViewCompleteIfShown();
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
    vscode.commands.registerCommand("devads.signIn", () => signIn(context, readConfig().adServerUrl)),
    vscode.commands.registerCommand("devads.signOut", () => signOut(context)),
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
    })
  );
}

export function deactivate() {
  // Nothing to persist -- session lives in SecretStorage, timers are
  // disposed via context.subscriptions.
}
