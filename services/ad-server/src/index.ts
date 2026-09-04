// Loads a root .env file (if present) BEFORE anything else runs. This must
// stay a dynamic import below, not a static `import ... from "./app.js"` --
// static ES module imports are resolved and their top-level code executed
// before this file's own statements run, which would read process.env.*
// (in lib/config.ts, lib/storage.ts, etc.) before dotenv had a chance to
// populate it.
import { fileURLToPath } from "node:url";
import path from "node:path";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

async function main() {
  const { buildApp } = await import("./app.js");
  const { config } = await import("./lib/config.js");
  const { ensureBucketExists } = await import("./lib/storage.js");

  await ensureBucketExists().catch((err) =>
    console.warn("Could not ensure object storage bucket exists (uploads will fail until it does):", err?.message ?? err)
  );

  const app = await buildApp();
  await app.listen({ port: config.port, host: config.host });
  console.log(`DevAds ad-server listening on ${config.host}:${config.port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
