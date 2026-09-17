'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    LayoutDashboard,
    Users,
    ClipboardList,
    MessageSquare,
    CreditCard,
    Camera,
    UserCheck,
    Sparkles,
} from "lucide-react";
import { UserRole } from "@/lib/dashboard-types";

const navConfig: Record<UserRole, { label: string; href: string; icon: any }[]> = {
    admin: [
        { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
        { label: "Approvals", href: "/admin", icon: UserCheck },
        { label: "Customers", href: "/admin", icon: Users },
        { label: "Tasks", href: "/admin", icon: ClipboardList },
        { label: "Uploads", href: "/admin", icon: Camera },
        { label: "Messages", href: "/admin", icon: MessageSquare },
        { label: "Payments", href: "/admin", icon: CreditCard },
    ],
    customer: [
        { label: "Dashboard", href: "/customer", icon: LayoutDashboard },
        { label: "My Tasks", href: "/customer", icon: ClipboardList },
        { label: "Messages", href: "/customer", icon: MessageSquare },
        { label: "Payments", href: "/customer", icon: CreditCard },
    ],
    employee: [
        { label: "Dashboard", href: "/employee", icon: LayoutDashboard },
        { label: "Assigned Tasks", href: "/employee", icon: ClipboardList },
        { label: "Uploads", href: "/employee", icon: Camera },
        { label: "Messages", href: "/employee", icon: MessageSquare },
    ],
};

export default function Sidebar({ role }: { role: UserRole }) {
    const pathname = usePathname();
    const items = navConfig[role];

    return (
        <aside className="border-r border-white/10 bg-slate-900/60 backdrop-blur-2xl">
            <div className="sticky top-0 flex h-screen flex-col px-5 py-6">
                <div className="mb-8 rounded-3xl border border-white/10 bg-white/5 p-5 shadow-[0_20px_50px_-30px_rgba(0,0,0,0.8)]">
                    <Link href="/" className="block">
                        <div className="flex items-center gap-3">
                            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-300 to-orange-500 text-slate-950 shadow-lg">
                                <Sparkles size={18} />
                            </div>
                            <div>
                                <h2 className="text-xl font-black tracking-tight">
                                    Jigzack<span className="text-amber-300">.</span>
                                </h2>
                                <p className="text-xs uppercase tracking-[0.2em] text-white/45">
                                    {role} panel
                                </p>
                            </div>
                        </div>
                    </Link>
                </div>

                <nav className="space-y-2">
                    {items.map((item, index) => {
                        const Icon = item.icon;
                        const active = pathname === item.href;

                        return (
                            <Link
                                key={`${role}-${item.label}`}
                                href={item.href}
                                className={`dashboard-fade-up group flex items-center gap-3 rounded-2xl px-4 py-3 transition duration-300`}
                                style={{ animationDelay: `${index * 70}ms` }}
                            >
                                <div
                                    className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 transition ${
                                        active
                                            ? "bg-gradient-to-r from-amber-300 to-orange-400 text-slate-950 shadow-[0_16px_40px_-18px_rgba(251,191,36,0.9)]"
                                            : "bg-white/[0.04] text-white/75 hover:bg-white/[0.08] hover:text-white hover:translate-x-1"
                                    }`}
                                >
                                    <Icon size={18} />
                                    <span className="font-medium">{item.label}</span>
                                </div>
                            </Link>
                        );
                    })}
                </nav>

                <div className="mt-auto rounded-3xl border border-white/10 bg-gradient-to-br from-white/8 to-white/5 p-5 shadow-[0_20px_50px_-30px_rgba(0,0,0,0.8)]">
                    <p className="text-sm font-semibold text-white">Operations at a glance</p>
                    <p className="mt-2 text-sm leading-relaxed text-white/60">
                        Approvals, customer activity, field task tracking, uploads, messages, and payments in one premium workspace.
                    </p>
                </div>
            </div>
        </aside>
    );
}