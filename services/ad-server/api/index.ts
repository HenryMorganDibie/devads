// Vercel serverless entry point. Every request is rewritten here (see
// vercel.json) and handed to the same Fastify app `npm start` serves, so
// routes, auth, CORS and rate limits behave identically. The app is built
// once per warm instance. Imports the compiled output because the build
// step (tsc) runs before Vercel bundles this function.
import type { IncomingMessage, ServerResponse } from "node:http";
import { buildApp } from "../dist/app.js";

type App = Awaited<ReturnType<typeof buildApp>>;
let ready: Promise<App> | undefined;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  ready ??= buildApp().then(async (app) => {
    await app.ready();
    return app;
  });
  const app = await ready;
  app.server.emit("request", req, res);
}
