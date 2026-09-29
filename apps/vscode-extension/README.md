# DevAds

Turn developer wait time into value.

DevAds shows a small, tasteful sponsored card during builds, installs, and tests
you were already waiting on. It never delays a command to sell an impression:
if your build finishes before the minimum wait threshold, you never see an ad.

## How it works

1. When a terminal command starts, DevAds starts a local timer for that terminal.
2. If the command is still running once `devads.minimumWaitSeconds` (default 8s)
   has elapsed, DevAds asks the ad server for a candidate.
3. If a candidate comes back **and the command is still running**, a compact
   sponsored card appears in the status bar. It disappears the instant the
   command finishes, fails, or is cancelled.
4. You can disable DevAds entirely, filter by category, or adjust the minimum
   wait time in Settings (search "DevAds").

On a wait with no regular card showing, DevAds may instead show a
**sponsored offer** with a reward (for example AI or API credits) in its own
status bar item labelled "Sponsored", with **View offer** and **Skip**.
Opening the sponsor's link is the only action DevAds counts toward a reward,
and the server decides whether one is granted. Turn offers off with
`devads.sponsorship.enabled`.

## Privacy

DevAds only ever sends: detected programming language, runtime, OS platform, and
the **name** of the command being run (e.g. `npm`, never the full command line
or its arguments). It never reads file contents, environment variables,
secrets, or source code. Sponsored offers send less: only the extension's
client type and version plus session and offer ids. See the full privacy
policy at the DevAds web app (`/privacy`).

## Commands

- `DevAds: Sign In` / `DevAds: Sign Out`
- `DevAds: Enable` / `DevAds: Disable`
- `DevAds: Open Dashboard`
- `DevAds: Show Status`
- `DevAds: Show Reward Wallet`

## Requirements

Requires VS Code terminal shell integration (VS Code 1.93+). If shell
integration isn't available in your environment, DevAds stays fully inert.

## Local development

```bash
npm install
npm run build      # bundles dist/extension.js
npm run package    # produces devads-0.1.0.vsix
```

Press F5 in VS Code (with this folder open) to launch an Extension Development
Host for interactive testing, or install the packaged `.vsix` via
**Extensions → ... → Install from VSIX**.
