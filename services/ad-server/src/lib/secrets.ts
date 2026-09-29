/**
 * The session-signing secret, resolved once for the whole server.
 *
 * Anyone who knows this value can mint a session token for any user or
 * role, including ADMIN. The development default below is published in
 * .env.example, so it must never sign tokens in production: there, a
 * missing, short or default secret stops the server from starting instead
 * of silently falling back.
 */

export const DEV_SESSION_SECRET = "dev-only-session-secret-change-me-please-32chars";
const MIN_SECRET_LENGTH = 32;

type Env = Record<string, string | undefined>;

/** Production means NODE_ENV=production, or running on Vercel (which may inherit a copied .env's NODE_ENV). */
export function isProductionEnv(env: Env): boolean {
  return env.NODE_ENV === "production" || env.VERCEL === "1";
}

export function resolveSessionSecret(env: Env = process.env): string {
  const secret = env.SESSION_SECRET?.trim();
  if (!isProductionEnv(env)) return secret || DEV_SESSION_SECRET;

  if (!secret) {
    throw new Error("SESSION_SECRET is not set. Refusing to start in production without a session-signing secret.");
  }
  if (secret === DEV_SESSION_SECRET) {
    throw new Error("SESSION_SECRET is the public development default. Set a unique random value for production.");
  }
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`SESSION_SECRET must be at least ${MIN_SECRET_LENGTH} characters in production.`);
  }
  return secret;
}

export const SESSION_SECRET = resolveSessionSecret();
