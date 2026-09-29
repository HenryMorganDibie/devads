import { NextResponse, type NextRequest } from "next/server";

/**
 * Sends visitors on any other *.vercel.app production address (the
 * auto-assigned project alias, per-deployment URLs) to the canonical site
 * address with a permanent redirect. Preview deployments and local dev are
 * untouched, as is everything when NEXT_PUBLIC_SITE_URL is unset.
 */
const canonical = process.env.NEXT_PUBLIC_SITE_URL ? new URL(process.env.NEXT_PUBLIC_SITE_URL) : null;

export function middleware(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  if (
    canonical &&
    process.env.VERCEL_ENV === "production" &&
    host.endsWith(".vercel.app") &&
    host !== canonical.host
  ) {
    const url = new URL(request.nextUrl.pathname + request.nextUrl.search, canonical);
    return NextResponse.redirect(url, 308);
  }
  return NextResponse.next();
}

export const config = {
  // Skip Next internals and static assets; pages, robots and OG images still redirect.
  matcher: ["/((?!_next/static|_next/image).*)"],
};
