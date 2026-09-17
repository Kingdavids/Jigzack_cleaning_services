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
        { label: "Approvals", href: "/admin#approvals", icon: UserCheck },
        { label: "Customers", href: "/admin#customers", icon: Users },
        { label: "Tasks", href: "/admin#tasks", icon: ClipboardList },
        { label: "Uploads", href: "/admin#uploads", icon: Camera },
        { label: "Messages", href: "/admin#messages", icon: MessageSquare },
        { label: "Payments", href: "/admin#payments", icon: CreditCard },
    ],
    customer: [
        { label: "Dashboard", href: "/customer", icon: LayoutDashboard },
        { label: "My Tasks", href: "/customer#tasks", icon: ClipboardList },
        { label: "Messages", href: "/customer#messages", icon: MessageSquare },
        { label: "Payments", href: "/customer#payments", icon: CreditCard },
    ],
    employee: [
        { label: "Dashboard", href: "/employee", icon: LayoutDashboard },
        { label: "Assigned Tasks", href: "/employee#tasks", icon: ClipboardList },
        { label: "Uploads", href: "/employee#uploads", icon: Camera },
        { label: "Messages", href: "/employee#messages", icon: MessageSquare },
    ],
};

export default function Sidebar({ role }: { role: UserRole }) {
    const pathname = usePathname();
    const items = navConfig[role];

    return (
        <aside className="border-r border-white/10 bg-[#0d0d0f]">
            <div className="sticky top-0 flex h-screen flex-col px-4 py-6">
                <Link href="/" className="mb-8 flex items-center gap-3 px-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400 text-slate-950">
                        <Sparkles size={17} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold tracking-tight">
                            Jigzack<span className="text-amber-300">.</span>
                        </h2>
                        <p className="text-xs uppercase tracking-[0.2em] text-white/40">{role} panel</p>
                    </div>
                </Link>

                <nav className="space-y-1">
                    {items.map((item) => {
                        const Icon = item.icon;
                        const active = pathname === item.href.split("#")[0] && item.href === navConfig[role][0].href;

                        return (
                            <Link
                                key={`${role}-${item.label}`}
                                href={item.href}
                                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                                    active
                                        ? "bg-amber-400/15 text-amber-300"
                                        : "text-white/65 hover:bg-white/[0.06] hover:text-white"
                                }`}
                            >
                                <Icon size={17} />
                                <span className="font-medium">{item.label}</span>
                            </Link>
                        );
                    })}
                </nav>
            </div>
        </aside>
    );
}