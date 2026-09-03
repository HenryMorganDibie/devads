import Fastify from "fastify";
import cors from "@fastify/cors";
import { registerAdsRoutes } from "./routes/ads.js";
import { registerEventsRoutes } from "./routes/events.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerEarningsRoutes } from "./routes/earnings.js";
import { registerCampaignsRoutes } from "./routes/campaigns.js";
import { registerDeveloperRoutes } from "./routes/developers.js";

export async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true });

  app.get("/health", async () => ({ status: "ok" }));

  await registerAdsRoutes(app);
  await registerEventsRoutes(app);
  await registerAuthRoutes(app);
  await registerEarningsRoutes(app);
  await registerCampaignsRoutes(app);
  await registerDeveloperRoutes(app);

  return app;
}
