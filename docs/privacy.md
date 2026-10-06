# Privacy

DevAds is built on a strict allowlist, not a denylist: the extension only
ever sends fields explicitly listed below. Anything not on this list is
never collected, by design.

## What is collected

When the extension asks the ad server for a candidate (only after you've
been waiting `devads.minimumWaitSeconds` on a still-running command):

| Field | Example | Notes |
|---|---|---|
| Detected language | `typescript` | from the active editor's language id, not file contents |
| Detected runtime | `node` | inferred from language, not read from any file |
| OS platform | `darwin` / `win32` / `linux` | from `os.platform()` |
| Coarse command name | `npm` | first token of the command line only, truncated to 32 chars -- **never the full command, its arguments, or flags** |
| Developer id, installation id | opaque ids | pseudonymous, generated locally, not derived from anything identifying |
| Elapsed wait seconds | `12` | how long the command has been running |

When you view, click, or dismiss an ad, the extension reports which
event happened, for which campaign/impression, and (for view-complete) how
long the ad was visible -- nothing else.

For sponsored offers with rewards (`devads.sponsorship.enabled`), the
extension sends less than the above:

| Field | Example | Notes |
|---|---|---|
| Client type | `VS_CODE` | fixed value identifying the tool |
| Extension version | `0.1.0` | from the extension's own manifest |
| Session id, offer display id, event id | opaque ids | server-issued, or random per event |
| Interaction kind | `WAIT` | what kind of moment the offer is for; the terminal wait is always `WAIT` |
| Available seconds | `19` | estimated whole seconds left in the wait, so the server can pick a video that fits. Sent only in panel mode with `devads.sponsorship.video.enabled` on, and only for a command this machine has seen finish before |
| Interaction type | `OFFER_SKIPPED` / `OFFER_OPENED` / `OFFER_INTERACTED` / `OFFER_COMPLETED` | only after an explicit click |
| Developer id | opaque id | only when you run **DevAds: Show Reward Wallet** |

No language, runtime, platform or command name is sent with offer
requests.

To estimate available seconds, the extension keeps a local history of how
long recent commands took, in VS Code's workspace storage on your machine:
each command is stored only as a SHA-256 hash of its normalized text (at
most 200 commands, 5 durations each). The history is never sent; only the
resulting number of seconds is. Turning video off
(`devads.sponsorship.video.enabled`) or using `statusBar` presentation
stops both the estimate and the recording.

When you open one of DevAds' own beta offers, the page URL on the DevAds
site carries the offer's display id, your session id and the minimum time
on the page, so the site can verify that exact offer. Third-party links are
opened exactly as the sponsor provided them, with no DevAds ids added.

## What is never collected

- Source code or file contents
- Environment variables
- Secrets, credentials, API keys, tokens
- Full command lines or arguments (only the coarse command name, e.g. `npm`)
- Repository contents or file paths
- Browser history, keystrokes, or anything outside the terminal
  lifecycle events described above

## Controls

- `devads.telemetryEnabled` (default on): turning this off stops the
  extension from sending even the allowlisted fields above with ad
  requests.
- `devads.enabled`: disables ad requests entirely.
- `devads.sponsorship.enabled`: disables sponsored-offer requests and the
  reward session without affecting regular cards.
- Delete your account and all associated data any time: developer dashboard
  → account settings, or `DELETE /api/v1/developers/:id` (also available via
  `GET /api/v1/developers/:id/export` first, to see everything that will be
  deleted).

## Data retention

Impressions, events, and the earnings ledger are retained for accounting
and dispute-resolution purposes. Deleting your account cascades to remove
your developer profile, privacy consents, client installations, ad
impressions, ad events, earnings ledger entries, and payout records.

## For advertisers

Advertiser-side data (account, campaigns, creatives, billing) is covered by
the same principle: collect what's needed to run and bill a campaign, and
nothing else. Destination URLs and creatives are reviewed before a campaign
can serve (see the advertiser guide).
