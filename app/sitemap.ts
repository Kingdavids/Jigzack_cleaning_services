import type { MetadataRoute } from "next";

const PAGES = ["", "/about", "/services", "/contact"];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://jigzackcleaningservices.com").replace(/\/$/, "");

  return PAGES.map((path) => ({
    url: `${base}${path}`,
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1 : 0.7,
  }));
}
