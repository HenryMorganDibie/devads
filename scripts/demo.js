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

console.log("== DevAds demo setup ==");

run("docker compose up -d postgres minio", ROOT);

console.log("\nWaiting for Postgres to accept connections...");
execSync(
  `node -e "` +
    `const {execSync}=require('child_process');` +
    `for(let i=0;i<30;i++){try{execSync('docker exec devads-postgres pg_isready -U devads',{stdio:'ignore'});process.exit(0)}catch(e){}` +
    `require('child_process').execSync(process.platform==='win32'?'timeout /t 2 >nul':'sleep 2')}` +
    `console.error('Postgres did not become ready in time');process.exit(1)"`,
  { stdio: "inherit" }
);

run("npx prisma migrate deploy", DB_PACKAGE, { DATABASE_URL });
run("npx tsx seed/index.ts", DB_PACKAGE, { DATABASE_URL });

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
