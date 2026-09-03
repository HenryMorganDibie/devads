import { buildApp } from "./app.js";
import { config } from "./lib/config.js";

buildApp()
  .then((app) => app.listen({ port: config.port, host: config.host }))
  .then(() => {
    console.log(`DevAds ad-server listening on ${config.host}:${config.port}`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
