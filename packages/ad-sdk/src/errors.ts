/**
 * Every failure the SDK surfaces is a DevAdsError with a stable `code`, so
 * an adapter can decide how to degrade (typically: show nothing, never
 * disrupt the developer's work) without parsing messages or knowing HTTP.
 *
 *  - "invalid_request":  the caller's input failed the shared request schema;
 *                        nothing was sent.
 *  - "unauthenticated":  no session token is available; nothing was sent.
 *  - "network":          the request could not be completed.
 *  - "timeout":          the request exceeded the configured timeout.
 *  - "rejected":         the server answered with a non-2xx status.
 *                        `status` and `reason` (the server's `error` string,
 *                        e.g. "developer_daily_cap_reached") are set.
 *  - "invalid_response": the server answered 2xx but the body did not match
 *                        the shared response schema; it is never trusted.
 */
export type DevAdsErrorCode =
  | "invalid_request"
  | "unauthenticated"
  | "network"
  | "timeout"
  | "rejected"
  | "invalid_response";

export class DevAdsError extends Error {
  readonly code: DevAdsErrorCode;
  /** HTTP status for "rejected" / "invalid_response"; undefined otherwise. */
  readonly status?: number;
  /** Server-provided machine-readable reason for "rejected" (e.g. "session_ended"). */
  readonly reason?: string;

  constructor(code: DevAdsErrorCode, message: string, opts: { status?: number; reason?: string; cause?: unknown } = {}) {
    super(message);
    this.name = "DevAdsError";
    this.code = code;
    this.status = opts.status;
    this.reason = opts.reason;
    if (opts.cause !== undefined) (this as { cause?: unknown }).cause = opts.cause;
  }
}

export function isDevAdsError(err: unknown): err is DevAdsError {
  return err instanceof DevAdsError;
}
