'use client';

import { ReactNode } from "react";
import { UserRole } from "@/lib/dashboard-types";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

interface DashboardShellProps {
    role: UserRole;
    title: string;
    subtitle: string;
    children: ReactNode;
}

export default function DashboardShell({
                                           role,
                                           title,
                                           subtitle,
                                           children,
                                       }: DashboardShellProps) {
    return (
        <div className="min-h-screen text-white">
            <div className="grid min-h-screen lg:grid-cols-[300px_1fr]">
                <Sidebar role={role} />

                <div className="relative flex min-h-screen flex-col">
                    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.08),transparent_20%),radial-gradient(circle_at_left,rgba(249,115,22,0.07),transparent_18%)]" />
                    <Topbar title={title} subtitle={subtitle} />

                    <main className="relative z-10 flex-1 px-4 py-6 md:px-6 lg:px-8">
                        <div className="mx-auto max-w-7xl space-y-6 dashboard-fade-up">
                            {children}
                        </div>
                    </main>
                </div>
            </div>
        </div>
    );
}