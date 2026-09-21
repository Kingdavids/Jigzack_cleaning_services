'use client';

import { ReactNode, useState } from "react";
import { UserRole } from "@/lib/dashboard-types";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

interface DashboardShellProps {
    role: UserRole;
    title: string;
    subtitle: string;
    unreadCount?: number;
    children: ReactNode;
}

export default function DashboardShell({
                                           role,
                                           title,
                                           subtitle,
                                           unreadCount,
                                           children,
                                       }: DashboardShellProps) {
    const [mobileNavOpen, setMobileNavOpen] = useState(false);

    return (
        <div className="min-h-screen bg-[#0a0a0b] text-white">
            <div className="grid min-h-screen lg:grid-cols-[260px_1fr]">
                <Sidebar role={role} open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />

                <div className="flex min-h-screen flex-col">
                    <Topbar
                        title={title}
                        subtitle={subtitle}
                        unreadCount={unreadCount}
                        role={role}
                        onOpenMenu={() => setMobileNavOpen(true)}
                    />

                    <main className="flex-1 px-4 py-6 md:px-6 lg:px-8">
                        <div className="mx-auto max-w-7xl space-y-5">{children}</div>
                    </main>
                </div>
            </div>
        </div>
    );
}
