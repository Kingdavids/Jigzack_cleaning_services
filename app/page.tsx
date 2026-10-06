import type { Metadata } from "next";
import HomePage from "@/components/HomePage";
import { SITE } from "@/lib/seo";
import { BUSINESS } from "@/lib/config/business";

// The home page keeps the site-wide title; only the address and previews are
// set here, so the page itself can stay a server component for search engines.
export const metadata: Metadata = {
  title: { absolute: `${BUSINESS.name} | Waste collection in ${BUSINESS.cities.join(" and ")}` },
  description: SITE.description,
  alternates: { canonical: "/" },
  openGraph: {
    title: BUSINESS.name,
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
