'use client';

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

// Dashboards render their own DashboardShell/Topbar navigation, so the
// public marketing navbar and footer are skipped on those routes.
const DASHBOARD_PREFIXES = ["/admin", "/employee", "/customer"];

export default function SiteChrome({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const isDashboard = DASHBOARD_PREFIXES.some((prefix) => pathname?.startsWith(prefix));

    if (isDashboard) return <>{children}</>;

    return (
        <>
            <Navbar />
            <div className="pt-24 md:pt-28">{children}</div>
            <Footer />
        </>
    );
}
