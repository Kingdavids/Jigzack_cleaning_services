import type { MetadataRoute } from "next";
import { SITE } from "@/lib/seo";

const PAGES: { path: string; changeFrequency: "weekly" | "monthly"; priority: number }[] = [
  { path: "", changeFrequency: "weekly", priority: 1 },
  { path: "/services", changeFrequency: "monthly", priority: 0.9 },
  { path: "/about", changeFrequency: "monthly", priority: 0.7 },
  { path: "/contact", changeFrequency: "monthly", priority: 0.8 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return PAGES.map(({ path, changeFrequency, priority }) => ({
    url: `${SITE.url}${path}`,
    lastModified,
    changeFrequency,
    priority,
  }));
}
