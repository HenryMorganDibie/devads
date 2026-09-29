import { isDevAdsError } from "../errors.js";

/**
 * Short, log-safe description of an SDK failure: the error code plus the
 * server's machine-readable reason. Never includes request contents, so an
 * adapter can log it without leaking anything about the developer's work.
 */
export function describeError(err: unknown): string {
  if (isDevAdsError(err)) return err.reason ? `${err.code} (${err.reason})` : err.code;
  return "unexpected_error";
}

/** Server reasons meaning a cached session id is no longer usable and a fresh session should be started. */
export function isStaleSessionError(err: unknown): boolean {
  return (
    isDevAdsError(err) &&
    err.code === "rejected" &&
    (err.reason === "session_ended" || err.reason === "forbidden" || err.reason === "session_not_found")
  );
}

/**
 * Whether a completion failure may be retried for the same display.
 * Transport failures may; a server refusal (caps, campaign ended, offer
 * expired, ...) is final for that display.
 */
export function isRetryableCompletionError(err: unknown): boolean {
  return !isDevAdsError(err) || err.code === "network" || err.code === "timeout";
}
