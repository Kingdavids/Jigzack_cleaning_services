import type { MetadataRoute } from "next";
import { SITE } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Dashboards are private and never linked from public pages. /auth is
      // left crawlable on purpose so search engines can see its noindex tag.
      disallow: ["/admin", "/customer", "/employee", "/api"],
    },
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
