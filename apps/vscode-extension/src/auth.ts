import * as vscode from "vscode";

const SESSION_TOKEN_KEY = "devads.sessionToken";
const DEVELOPER_ID_KEY = "devads.developerId";

interface DeviceStartResponse {
  deviceCode: string;
  userCode: string;
  verificationUrl: string;
  expiresInSeconds: number;
  pollIntervalSeconds: number;
}

interface DevicePollResponse {
  status: "pending" | "approved" | "expired";
  token: string | null;
  developerId: string | null;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, init);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Device-pairing sign-in: shows a short code, opens the web dashboard's
 * /device page in the browser, and polls until the developer approves it
 * there. Session token is stored in VS Code SecretStorage, never in
 * workspace settings or plain files.
 */
export async function signIn(context: vscode.ExtensionContext, adServerUrl: string): Promise<boolean> {
  const start = await fetchJson<DeviceStartResponse>(`${adServerUrl}/api/v1/auth/device/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ platform: process.platform, extensionVersion: context.extension.packageJSON.version }),
  });

  if (!start) {
    void vscode.window.showErrorMessage("DevAds: could not reach the ad server. Check devads.adServerUrl.");
    return false;
  }

  const openInBrowser = "Open browser";
  const choice = await vscode.window.showInformationMessage(
    `DevAds: enter code ${start.userCode} at ${start.verificationUrl} to sign in.`,
    openInBrowser
  );
  if (choice === openInBrowser) {
    void vscode.env.openExternal(vscode.Uri.parse(start.verificationUrl));
  }

  return vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "DevAds: waiting for sign-in..." },
    async (_progress, cancelToken) => {
      const deadline = Date.now() + start.expiresInSeconds * 1000;
      while (Date.now() < deadline) {
        if (cancelToken.isCancellationRequested) return false;
        await new Promise((r) => setTimeout(r, start.pollIntervalSeconds * 1000));

        const poll = await fetchJson<DevicePollResponse>(`${adServerUrl}/api/v1/auth/device/poll`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceCode: start.deviceCode }),
        });
        if (!poll) continue;
        if (poll.status === "expired") {
          void vscode.window.showWarningMessage("DevAds: sign-in code expired. Try again.");
          return false;
        }
        if (poll.status === "approved" && poll.token) {
          await context.secrets.store(SESSION_TOKEN_KEY, poll.token);
          if (poll.developerId) await setDeveloperId(context, poll.developerId);
          void vscode.window.showInformationMessage("DevAds: signed in.");
          return true;
        }
      }
      void vscode.window.showWarningMessage("DevAds: sign-in timed out.");
      return false;
    }
  );
}

export async function signOut(context: vscode.ExtensionContext): Promise<void> {
  await context.secrets.delete(SESSION_TOKEN_KEY);
  await context.globalState.update(DEVELOPER_ID_KEY, undefined);
}

export async function getSessionToken(context: vscode.ExtensionContext): Promise<string | undefined> {
  return context.secrets.get(SESSION_TOKEN_KEY);
}

export function getDeveloperId(context: vscode.ExtensionContext): string | undefined {
  return context.globalState.get<string>(DEVELOPER_ID_KEY);
}

export async function setDeveloperId(context: vscode.ExtensionContext, developerId: string): Promise<void> {
  await context.globalState.update(DEVELOPER_ID_KEY, developerId);
}
