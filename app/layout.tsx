import "./globals.css";

import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Plus_Jakarta_Sans } from "next/font/google";
import { AuthProvider } from "@/components/context/AuthProvider";
import { Toaster } from "sonner";
import SiteChrome from "@/components/SiteChrome";
import JsonLd from "@/components/JsonLd";
import { SITE, organizationJsonLd, websiteJsonLd } from "@/lib/seo";

const jakarta = Plus_Jakarta_Sans({
    subsets: ["latin"],
    variable: "--font-jakarta",
    display: "swap",
});

export const viewport: Viewport = {
    themeColor: "#020617",
    colorScheme: "dark",
};

export const metadata: Metadata = {
    metadataBase: new URL(SITE.url),
    applicationName: SITE.name,
    title: {
        default: "Jigzack Cleaning Services | Waste collection in Lagos and Port Harcourt",
        template: "%s | Jigzack Cleaning Services",
    },
    description: SITE.description,
    keywords: [
        "waste collection Lagos",
        "waste collection Port Harcourt",
        "LAWMA approved waste disposal",
        "refuse collection",
        "domestic waste collection",
        "commercial waste disposal",
        "waste management Nigeria",
        "Jigzack Cleaning Services",
    ],
    authors: [{ name: SITE.name, url: SITE.url }],
    creator: SITE.name,
    publisher: SITE.name,
    formatDetection: { telephone: true, email: true, address: false },
    openGraph: {
        title: "Jigzack Cleaning Services",
        description: SITE.description,
        siteName: SITE.name,
        locale: SITE.locale,
        type: "website",
    },
    twitter: {
        card: "summary_large_image",
        title: "Jigzack Cleaning Services",
        description: SITE.description,
    },
    robots: {
        index: true,
        follow: true,
        googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
    },
    // Set GOOGLE_SITE_VERIFICATION (and BING_SITE_VERIFICATION) to the codes
    // from Search Console and Bing Webmaster Tools to prove ownership.
    verification: {
        google: process.env.GOOGLE_SITE_VERIFICATION,
        other: process.env.BING_SITE_VERIFICATION ? { "msvalidate.01": process.env.BING_SITE_VERIFICATION } : undefined,
    },
};

export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="en-NG" className={jakarta.variable}>
        <body className="bg-slate-950 text-white">
        <JsonLd data={[organizationJsonLd(), websiteJsonLd()]} />
        <AuthProvider>
            <SiteChrome>{children}</SiteChrome>
            <Toaster />
        </AuthProvider>
        </body>
        </html>
    );
}
