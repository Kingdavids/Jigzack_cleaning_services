'use client';

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, LogOut, Menu } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import type { UserRole } from "@/lib/dashboard-types";

export default function Topbar({
                                   title,
                                   subtitle,
                                   unreadCount: initialUnreadCount = 0,
                                   role,
                                   profileId,
                                   onOpenMenu,
                               }: {
    title: string;
    subtitle: string;
    unreadCount?: number;
    role: UserRole;
    profileId: string;
    onOpenMenu: () => void;
}) {
    const router = useRouter();
    const [unreadCount, setUnreadCount] = useState(initialUnreadCount);

    useEffect(() => {
        setUnreadCount(initialUnreadCount);
    }, [initialUnreadCount]);

    // Keeps the bell badge live across every dashboard page, not just the
    // messages page itself -- a new message should bump it immediately.
    useEffect(() => {
        const supabase = createClient();

        const channel = supabase
            .channel(`unread-badge-${profileId}`)
            .on(
                "postgres_changes",
                { event: "INSERT", schema: "public", table: "messages", filter: `to_profile_id=eq.${profileId}` },
                () => setUnreadCount((c) => c + 1)
            )
            .on(
                "postgres_changes",
                { event: "UPDATE", schema: "public", table: "messages", filter: `to_profile_id=eq.${profileId}` },
                (payload) => {
                    if ((payload.new as { read_at: string | null }).read_at) {
                        setUnreadCount((c) => Math.max(0, c - 1));
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [profileId]);

    const handleLogout = async () => {
        const supabase = createClient();
        await supabase.auth.signOut();
        router.push("/auth");
        router.refresh();
    };

    return (
        <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0a0a0b]/90 backdrop-blur">
            <div className="px-4 py-4 md:px-6 lg:px-8">
                <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={onOpenMenu}
                            aria-label="Open menu"
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/80 transition hover:bg-white/10 lg:hidden"
                        >
                            <Menu size={18} />
                        </button>

                        <div>
                            <h1 className="text-xl font-bold tracking-tight md:text-2xl">
                                {title}
                                <span className="text-amber-300">.</span>
                            </h1>
                            <p className="mt-0.5 text-sm text-white/50">{subtitle}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <Link
                            href={`/${role}/messages`}
                            aria-label={unreadCount > 0 ? `${unreadCount} unread messages` : "Messages"}
                            className="relative inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/80 transition hover:bg-white/10 hover:text-white"
                        >
                            <Bell size={18} />
                            {unreadCount > 0 && (
                                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400 px-1 text-[11px] font-bold text-black">
                                    {unreadCount > 9 ? "9+" : unreadCount}
                                </span>
                            )}
                        </Link>

                        <button
                            onClick={handleLogout}
                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white/80 transition hover:bg-white/10 hover:text-white"
                        >
                            <LogOut size={16} />
                            Logout
                        </button>
                    </div>
                </div>
            </div>
        </header>
    );
}
