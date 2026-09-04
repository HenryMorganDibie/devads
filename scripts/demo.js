#!/usr/bin/env node
// One-command demo setup: brings up Postgres + MinIO, migrates, seeds
// realistic demo data (admin/developer/advertiser/approved campaign with
// earnings history), and prints exactly what to do next. Idempotent --
// safe to run again against an already-running stack.
const { execSync } = require("node:child_process");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const DB_PACKAGE = path.join(ROOT, "packages", "database");
const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://devads:devads@localhost:5442/devads?schema=public";

function run(cmd, cwd, extraEnv = {}) {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { cwd, stdio: "inherit", env: { ...process.env, ...extraEnv } });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// A pure-Node wait loop rather than shelling out to a platform sleep
// command (`sleep` on POSIX, `timeout /t` in cmd.exe -- but neither exists,
// or means something different, under Git Bash on Windows, which broke a
// fresh `npm run demo` run there).
async function waitForPostgres() {
  console.log("\nWaiting for Postgres to accept connections...");
  for (let i = 0; i < 30; i++) {
    try {
      execSync("docker exec devads-postgres pg_isready -U devads", { stdio: "ignore" });
      return;
    } catch {
      // not ready yet
    }
    await sleep(2000);
  }
  console.error("Postgres did not become ready in time");
  process.exit(1);
}

async function main() {
  console.log("== DevAds demo setup ==");

  run("docker compose up -d postgres minio", ROOT);
  await waitForPostgres();

  // Belt-and-suspenders: `npm install`'s postinstall already runs this,
  // but re-running here is cheap and covers anyone who skipped/cached
  // past that step.
  run("npx prisma generate", DB_PACKAGE);
  run("npx prisma migrate deploy", DB_PACKAGE, { DATABASE_URL });
  run("npx tsx seed/index.ts", DB_PACKAGE, { DATABASE_URL });

  // The ad-server's dev script (tsx watch) imports the OTHER workspace
  // packages' compiled dist/ output, not their TypeScript source -- so
  // they must be built at least once before `npm run dev -w @devads/ad-server`
  // will even start. turbo's build task dependency graph (^build) means
  // building the ad-server also builds database/shared/targeting/auth
  // first, in the right order.
  console.log("\nBuilding workspace packages (needed before `npm run dev` will work)...");
  run("npx turbo run build --filter=@devads/ad-server", ROOT);

  console.log(`
== Demo environment ready ==

Start the backend + apps (in separate terminals, or via your process
manager of choice):

  DATABASE_URL="${DATABASE_URL}" npm run dev -w @devads/ad-server
  NEXT_PUBLIC_AD_SERVER_URL=http://localhost:4000 npm run dev -w @devads/web
  NEXT_PUBLIC_AD_SERVER_URL=http://localhost:4000 npm run dev -w @devads/advertiser-dashboard
  NEXT_PUBLIC_AD_SERVER_URL=http://localhost:4000 npm run dev -w @devads/admin-dashboard

Then:

  1. Admin dashboard:       http://localhost:3002  (admin@devads.dev / admin12345)
  2. Advertiser dashboard:  http://localhost:3001  (advertiser@devads.dev / advertiser12345)
     -- "Acme Cloud Launch (DEMO)" is already APPROVED and serving.
     -- "ShipFast CI Beta (DEMO)" is SUBMITTED, waiting in the admin approval queue.
  3. Developer dashboard:   http://localhost:3000/login (dev@devads.dev / dev12345)
     -- shows seeded earnings/impression/payout history.
  4. VS Code extension:
     - npm run package -w @devads/vscode-extension  (produces the .vsix)
     - Install it (Extensions -> ... -> Install from VSIX), sign in via
       "DevAds: Sign In" (device-pairing code, approve at /device).
     - Run a slow command to see the sponsored card:
         node scripts/demo-wait.js 30
     - Disable DevAds (command palette -> "DevAds: Disable") and re-run
       the command to confirm no ad appears.
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
