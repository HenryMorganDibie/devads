import { DevAdsError } from "./errors.js";

/**
 * The minimal slice of the WHATWG fetch API the SDK needs. Declared
 * structurally so any runtime's fetch (Node >= 18, VS Code's extension
 * host, Electron, Deno, Bun, a test double) satisfies it without the SDK
 * depending on DOM typings or a specific HTTP library.
 */
export interface FetchLikeResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

export interface FetchLikeInit {
  method: string;
  headers: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}

export type FetchLike = (url: string, init: FetchLikeInit) => Promise<FetchLikeResponse>;

/** Internal request descriptor. Built only by the client from the route table; never part of the public API. */
export interface WireRequest {
  method: "GET" | "POST";
  path: string;
  query?: Record<string, string | undefined>;
  body?: unknown;
  token: string;
}

export interface WireResponse {
  status: number;
  ok: boolean;
  /** Parsed JSON body, or undefined if the body was missing or not JSON. */
  body: unknown;
}

export const DEFAULT_TIMEOUT_MS = 4000;

function resolveFetch(fetchImpl: FetchLike | undefined): FetchLike {
  if (fetchImpl) return fetchImpl;
  const globalFetch = (globalThis as { fetch?: FetchLike }).fetch;
  if (!globalFetch) {
    throw new DevAdsError("network", "No fetch implementation available; pass `fetch` in DevAdsClientOptions");
  }
  return globalFetch.bind(globalThis);
}

/**
 * HTTP transport over fetch. Owns URL construction, the bearer header, the
 * timeout (the AbortSignal is attached before the request starts, so the
 * timeout actually cancels the request), and JSON decoding. It does not
 * interpret status codes or validate bodies; the client does that.
 */
export class HttpTransport {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;

  constructor(opts: { baseUrl: string; fetch?: FetchLike; timeoutMs?: number }) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.fetchImpl = resolveFetch(opts.fetch);
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  buildUrl(path: string, query?: Record<string, string | undefined>): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) params.set(key, value);
    }
    const qs = params.toString();
    return `${this.baseUrl}${path}${qs ? `?${qs}` : ""}`;
  }

  async send(req: WireRequest): Promise<WireResponse> {
    const headers: Record<string, string> = { Authorization: `Bearer ${req.token}` };
    let body: string | undefined;
    if (req.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(req.body);
    }

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);

    let res: FetchLikeResponse;
    try {
      res = await this.fetchImpl(this.buildUrl(req.path, req.query), {
        method: req.method,
        headers,
        body,
        signal: controller.signal,
      });
    } catch (err) {
      if (timedOut) throw new DevAdsError("timeout", `Request timed out after ${this.timeoutMs}ms`, { cause: err });
      throw new DevAdsError("network", "Request failed", { cause: err });
    } finally {
      clearTimeout(timer);
    }

    let parsed: unknown;
    try {
      parsed = await res.json();
    } catch {
      parsed = undefined;
    }
    return { status: res.status, ok: res.ok, body: parsed };
  }
}
