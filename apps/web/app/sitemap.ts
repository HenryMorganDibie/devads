import type { MetadataRoute } from "next";
import { SITE } from "../lib/site";

// Public pages only; signed-in and auth pages are disallowed in robots.ts.
// Empty until a canonical URL is configured, matching robots.ts.
export default function sitemap(): MetadataRoute.Sitemap {
  if (!SITE.url) return [];
  return [
    { url: `${SITE.url}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE.url}/join`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE.url}/advertise`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE.url}/beta/terms`, changeFrequency: "monthly", priority: 0.3 },
  ];
}
