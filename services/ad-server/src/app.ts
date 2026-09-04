import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import { registerAdsRoutes } from "./routes/ads.js";
import { registerEventsRoutes } from "./routes/events.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerEarningsRoutes } from "./routes/earnings.js";
import { registerCampaignsRoutes } from "./routes/campaigns.js";
import { registerDeveloperRoutes } from "./routes/developers.js";
import { attachSession } from "./lib/authGuard.js";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // matches storage.ts's video cap; images are checked again after upload

// CORS is a browser-enforced mechanism -- it only matters for the three
// Next.js dashboards (web, advertiser-dashboard, admin-dashboard) calling
// this API from the browser; the VS Code extension calls it from Node,
// which CORS doesn't apply to. Defaults to exactly those three known local
// dev origins rather than reflecting any origin (`origin: true`), which
// would let an arbitrary website's JS make authenticated requests against
// a signed-in user's browser session. Override with a comma-separated
// CORS_ALLOWED_ORIGINS for a real deployment (e.g. the production
// dashboard domains) -- never widen this back to `true`.
const DEFAULT_ALLOWED_ORIGINS = ["http://localhost:3000", "http://localhost:3001", "http://localhost:3002"];
const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS
  ? process.env.CORS_ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
  : DEFAULT_ALLOWED_ORIGINS;

export async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(cors, { origin: allowedOrigins });
  await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES } });
  // Global default: generous enough for normal extension polling +
  // dashboard use, but bounds abuse/DoS against the whole API. Sensitive
  // auth endpoints (login, signup, admin-login) set a much stricter
  // per-route limit below to slow down credential brute-forcing.
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });
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
