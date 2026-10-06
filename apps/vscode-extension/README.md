# DevAds

Sponsorship for AI-powered development, in VS Code.

DevAds shows opt-in, clearly labelled sponsored offers in its own panel
beside your editor while a build, install or test you were already waiting
on is still running. Offers render as a card, or as a short muted video when
one fits the time left. It never delays a command to show anything, and
nothing is ever placed in your code, terminal output, prompts or AI
conversations.

## How it works

1. When a terminal command starts, DevAds starts a local timer for that terminal.
2. If the command is still running once `devads.minimumWaitSeconds` (default 8s)
   has elapsed, DevAds asks the server for an offer. The server decides what,
   if anything, is eligible.
3. If an offer comes back **and the command is still running**, it opens in
   the **DevAds panel** beside the editor, without taking focus:
   - a **card**: attribution label, title, description, reward, **Open** and
     **Skip**;
   - a **video**: the same card plus a muted player, used only when a
     creative fits the time the command is expected to keep running (10, 15
     or 20 seconds). That estimate comes from how long the same command took
     before on this machine; commands are remembered only locally, as hashes.
4. When the command finishes, the offer ends and any video stops. The panel
   closes, unless you clicked into it, in which case it shows an empty state
   you can close.
5. The status bar is the compact mode (`devads.sponsorship.presentation` =
   `statusBar`, text only) and the fallback if the panel cannot open.

Every offer is labelled: **Sponsored** for a sponsor's offer, or **DevAds
Beta · First-party** for DevAds' own beta campaigns, which DevAds creates and
funds itself. Watching a video earns nothing: a reward needs the offer's
qualifying action, which the server verifies. The extension reports only
your explicit clicks (open, skip, view details). For DevAds' own offers the action is completed
on the DevAds site (spend at least 15 seconds on the page, then confirm), and
the reward appears in your wallet.

DevAds can also show a standard sponsored card (CPM campaigns) in the status
bar. Only one promotional surface is shown per wait.

## Privacy

For standard cards DevAds sends only the detected programming language,
runtime, OS platform and the **name** of the command (for example `npm`,
never the full command line or its arguments). Sponsored offers send less:
the extension's client type and version, session and offer ids, the
interaction kind (`WAIT`) and, when video is allowed, the estimated whole
seconds left in the wait. It never reads file contents, environment
variables, secrets, prompts or source code. See
[docs/privacy.md](https://github.com/HenryMorganDibie/devads/blob/main/docs/privacy.md).

## Settings

- `devads.enabled`: master switch.
- `devads.sponsorship.enabled`: sponsored offers and the reward session.
- `devads.sponsorship.presentation`: `panel` (default) or `statusBar`.
- `devads.sponsorship.video.enabled`: allow video offers in the panel.
- `devads.minimumWaitSeconds`: how long a command must run first.

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

The extension uses the production API and site by default. For a local stack
set `devads.adServerUrl` to `http://localhost:4000` and `devads.webAppUrl` to
`http://localhost:3000`.

Press F5 in VS Code (with this folder open) to launch an Extension Development
Host for interactive testing, or install the packaged `.vsix` via
**Extensions → ... → Install from VSIX**.
