import Fastify from "fastify";
import cors from "@fastify/cors";
import { registerAdsRoutes } from "./routes/ads.js";
import { registerEventsRoutes } from "./routes/events.js";

export async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true });

  app.get("/health", async () => ({ status: "ok" }));

  await registerAdsRoutes(app);
  await registerEventsRoutes(app);

  return app;
}
