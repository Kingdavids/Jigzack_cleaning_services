'use client'
import "./globals.css";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Plus_Jakarta_Sans } from "next/font/google";
import { AuthProvider } from "@/components/context/AuthProvider";
import { Toaster } from "sonner";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const jakarta = Plus_Jakarta_Sans({
    subsets: ["latin"],
    variable: "--font-jakarta",
    display: "swap",
});

// Dashboards render their own DashboardShell/Topbar navigation, so the
// public marketing navbar and footer are skipped on those routes.
const DASHBOARD_PREFIXES = ["/admin", "/employee", "/customer"];

export default function RootLayout({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const isDashboard = DASHBOARD_PREFIXES.some((prefix) => pathname?.startsWith(prefix));

    return (
        <html lang="en" className={jakarta.variable}>
        <body className="bg-slate-950 text-white">
        <AuthProvider>
            {isDashboard ? (
                children
            ) : (
                <>
                    <Navbar />
                    <div className="pt-24 md:pt-28">{children}</div>
                    <Footer />
                </>
            )}
            <Toaster />
        </AuthProvider>
        </body>
        </html>
    );
}