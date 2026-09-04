import { buildApp } from "./app.js";
import { config } from "./lib/config.js";
import { ensureBucketExists } from "./lib/storage.js";

ensureBucketExists()
  .catch((err) => console.warn("Could not ensure object storage bucket exists (uploads will fail until it does):", err?.message ?? err))
  .then(() => buildApp())
  .then((app) => app.listen({ port: config.port, host: config.host }))
  .then(() => {
    console.log(`DevAds ad-server listening on ${config.host}:${config.port}`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
