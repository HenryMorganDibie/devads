import type { MetadataRoute } from "next";
import { SITE } from "../lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Signed-in and auth pages have nothing to index.
      disallow: ["/dashboard", "/rewards", "/sponsorships", "/device", "/login", "/signup"],
    },
    ...(SITE.url ? { sitemap: `${SITE.url}/sitemap.xml`, host: SITE.url } : {}),
  };
}
