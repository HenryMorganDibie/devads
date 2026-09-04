import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { registerAdsRoutes } from "./routes/ads.js";
import { registerEventsRoutes } from "./routes/events.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerEarningsRoutes } from "./routes/earnings.js";
import { registerCampaignsRoutes } from "./routes/campaigns.js";
import { registerDeveloperRoutes } from "./routes/developers.js";
import { attachSession } from "./lib/authGuard.js";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // matches storage.ts's video cap; images are checked again after upload

export async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true });
  await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES } });
  app.addHook("onRequest", attachSession);

  app.get("/health", async () => ({ status: "ok" }));

  await registerAdsRoutes(app);
  await registerEventsRoutes(app);
  await registerAuthRoutes(app);
  await registerEarningsRoutes(app);
  await registerCampaignsRoutes(app);
  await registerDeveloperRoutes(app);

  return app;
}
