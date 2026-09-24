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
    Building2,
    UserPlus,
    CalendarDays,
    Receipt,
    ShieldCheck,
    History,
    X,
    type LucideIcon,
} from "lucide-react";
import { UserRole } from "@/lib/dashboard-types";

const navConfig: Record<UserRole, { label: string; href: string; icon: LucideIcon }[]> = {
    admin: [
        { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
        { label: "Approvals", href: "/admin/approvals", icon: UserCheck },
        { label: "Customers", href: "/admin/customers", icon: Users },
        { label: "Estates", href: "/admin/estates", icon: Building2 },
        { label: "Employees", href: "/admin/employees", icon: UserPlus },
        { label: "Tasks", href: "/admin/tasks", icon: ClipboardList },
        { label: "Uploads", href: "/admin/uploads", icon: Camera },
        { label: "Messages", href: "/admin/messages", icon: MessageSquare },
        { label: "Payments", href: "/admin/payments", icon: CreditCard },
        { label: "Expenses", href: "/admin/expenses", icon: Receipt },
        { label: "Admins", href: "/admin/admins", icon: ShieldCheck },
        { label: "Activity", href: "/admin/activity", icon: History },
    ],
    customer: [
        { label: "Dashboard", href: "/customer", icon: LayoutDashboard },
        { label: "Schedule", href: "/customer/schedule", icon: CalendarDays },
        { label: "Messages", href: "/customer/messages", icon: MessageSquare },
        { label: "Payments", href: "/customer/payments", icon: CreditCard },
    ],
    employee: [
        { label: "Dashboard", href: "/employee", icon: LayoutDashboard },
        { label: "Assigned Tasks", href: "/employee/tasks", icon: ClipboardList },
        { label: "Uploads", href: "/employee/uploads", icon: Camera },
        { label: "Expenses", href: "/employee/expenses", icon: Receipt },
        { label: "Messages", href: "/employee/messages", icon: MessageSquare },
    ],
};

function SidebarNav({
                         role,
                         pathname,
                         onNavigate,
                     }: {
    role: UserRole;
    pathname: string | null;
    onNavigate?: () => void;
}) {
    const items = navConfig[role];

    return (
        <>
            <Link href="/" onClick={onNavigate} className="mb-8 flex items-center gap-3 px-2">
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
                    const active = pathname === item.href;

                    return (
                        <Link
                            key={`${role}-${item.label}`}
                            href={item.href}
                            onClick={onNavigate}
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
        </>
    );
}

export default function Sidebar({
                                     role,
                                     open,
                                     onClose,
                                 }: {
    role: UserRole;
    open: boolean;
    onClose: () => void;
}) {
    const pathname = usePathname();

    return (
        <>
            {/* Desktop sidebar: always visible, part of the grid layout */}
            <aside className="hidden border-r border-white/10 bg-[#0d0d0f] lg:block">
                <div className="sticky top-0 flex h-screen flex-col px-4 py-6">
                    <SidebarNav role={role} pathname={pathname} />
                </div>
            </aside>

            {/* Mobile drawer: hidden off-canvas, toggled from the Topbar hamburger */}
            <div className={`fixed inset-0 z-40 lg:hidden ${open ? "" : "pointer-events-none"}`}>
                <div
                    onClick={onClose}
                    aria-hidden="true"
                    className={`absolute inset-0 bg-black/60 transition-opacity duration-300 ${
                        open ? "opacity-100" : "opacity-0"
                    }`}
                />

                <div
                    className={`absolute inset-y-0 left-0 flex w-72 max-w-[80vw] flex-col overflow-y-auto border-r border-white/10 bg-[#0d0d0f] px-4 py-6 transition-transform duration-300 ${
                        open ? "translate-x-0" : "-translate-x-full"
                    }`}
                >
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close menu"
                        className="mb-4 ml-auto flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/70 transition hover:bg-white/10"
                    >
                        <X size={16} />
                    </button>

                    <SidebarNav role={role} pathname={pathname} onNavigate={onClose} />
                </div>
            </div>
        </>
    );
}
