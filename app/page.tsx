import type { Metadata } from "next";
import HomePage from "@/components/HomePage";
import { SITE } from "@/lib/seo";

// The home page keeps the site-wide title; only the address and previews are
// set here, so the page itself can stay a server component for search engines.
export const metadata: Metadata = {
  title: { absolute: "Jigzack Cleaning Services | Waste collection in Lagos and Port Harcourt" },
  description: SITE.description,
  alternates: { canonical: "/" },
  openGraph: {
    title: "Jigzack Cleaning Services",
    description: SITE.description,
    url: "/",
    siteName: SITE.name,
    locale: SITE.locale,
    type: "website",
  },
};

export default function Page() {
  return <HomePage />;
}
