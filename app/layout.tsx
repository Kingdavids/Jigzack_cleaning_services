import "./globals.css";

import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Plus_Jakarta_Sans } from "next/font/google";
import { AuthProvider } from "@/components/context/AuthProvider";
import { Toaster } from "sonner";
import SiteChrome from "@/components/SiteChrome";

const jakarta = Plus_Jakarta_Sans({
    subsets: ["latin"],
    variable: "--font-jakarta",
    display: "swap",
});

const description =
    "LAWMA-approved waste collection for homes and businesses in Lagos and Port Harcourt. Scheduled pickups, monthly invoices and receipts online.";

export const metadata: Metadata = {
    metadataBase: process.env.NEXT_PUBLIC_SITE_URL ? new URL(process.env.NEXT_PUBLIC_SITE_URL) : undefined,
    title: {
        default: "Jigzack Cleaning Services | Waste collection in Lagos and Port Harcourt",
        template: "%s | Jigzack Cleaning Services",
    },
    description,
    openGraph: {
        title: "Jigzack Cleaning Services",
        description,
        images: ["/images/field/truck-side.jpg"],
        type: "website",
    },
};

export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="en" className={jakarta.variable}>
        <body className="bg-slate-950 text-white">
        <AuthProvider>
            <SiteChrome>{children}</SiteChrome>
            <Toaster />
        </AuthProvider>
        </body>
        </html>
    );
}
