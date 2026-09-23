import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Accounts and dashboards are private; only the public pages are indexed.
      disallow: ["/admin", "/customer", "/employee", "/auth"],
    },
    ...(base ? { sitemap: `${base}/sitemap.xml` } : {}),
  };
}
