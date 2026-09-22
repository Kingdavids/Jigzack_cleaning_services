'use client';

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, LogOut, Menu } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/utils/supabase/client";
import { playNotificationSound } from "@/lib/notification-sound";
import type { UserRole } from "@/lib/dashboard-types";
import type { RealtimeChannel } from "@supabase/supabase-js";

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
    const [justArrived, setJustArrived] = useState(false);
    const arrivedTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        setUnreadCount(initialUnreadCount);
    }, [initialUnreadCount]);

    // Keeps the bell badge live across every dashboard page, not just the
    // messages page itself, and surfaces a toast + a brief bell-ring + a
    // sound cue -- a quiet number changing in the corner is too easy to miss.
    useEffect(() => {
        const supabase = createClient();
        const channels: RealtimeChannel[] = [];

        const announce = () => {
            setJustArrived(true);
            if (arrivedTimeout.current) clearTimeout(arrivedTimeout.current);
            arrivedTimeout.current = setTimeout(() => setJustArrived(false), 1600);
            playNotificationSound();
        };

        const messagesChannel = supabase
            .channel(`unread-badge-${profileId}`)
            .on(
                "postgres_changes",
                { event: "INSERT", schema: "public", table: "messages", filter: `to_profile_id=eq.${profileId}` },
                async (payload) => {
                    setUnreadCount((c) => c + 1);
                    announce();

                    const newMessage = payload.new as { subject: string; from_profile_id: string };
                    const { data: sender } = await supabase
                        .from("profiles")
                        .select("full_name")
                        .eq("id", newMessage.from_profile_id)
                        .single();

                    toast.message(`New message from ${sender?.full_name ?? "someone"}`, {
                        description: newMessage.subject,
                        action: {
                            label: "View",
                            onClick: () => router.push(`/${role}/messages`),
                        },
                    });
                }
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

        channels.push(messagesChannel);

        if (role === "employee") {
            const tasksChannel = supabase
                .channel(`task-assign-${profileId}`)
                .on(
                    "postgres_changes",
                    { event: "INSERT", schema: "public", table: "tasks", filter: `employee_id=eq.${profileId}` },
                    (payload) => {
                        announce();
                        const task = payload.new as { title: string };
                        toast.message("New task assigned", {
                            description: task.title,
                            action: { label: "View", onClick: () => router.push("/employee/tasks") },
                        });
                    }
                )
                .subscribe();
            channels.push(tasksChannel);
        }

        if (role === "customer") {
            const uploadsChannel = supabase
                .channel(`uploads-${profileId}`)
                .on(
                    "postgres_changes",
                    { event: "INSERT", schema: "public", table: "uploads", filter: `customer_id=eq.${profileId}` },
                    (payload) => {
                        announce();
                        const upload = payload.new as { photo_type: string; task_title: string | null };
                        toast.message(`New ${upload.photo_type} photo uploaded`, {
                            description: upload.task_title ?? undefined,
                            action: { label: "View", onClick: () => router.push("/customer/tasks") },
                        });
                    }
                )
                .on(
                    "postgres_changes",
                    { event: "UPDATE", schema: "public", table: "tasks", filter: `customer_id=eq.${profileId}` },
                    (payload) => {
                        const task = payload.new as { title: string; status: string };
                        if (task.status !== "in progress" && task.status !== "completed") return;
                        announce();
                        toast.message(`Task ${task.status}`, {
                            description: task.title,
                            action: { label: "View", onClick: () => router.push("/customer/tasks") },
                        });
                    }
                )
                .subscribe();
            channels.push(uploadsChannel);
        }

        if (role === "admin") {
            const adminChannel = supabase
                .channel(`admin-activity-${profileId}`)
                .on(
                    "postgres_changes",
                    { event: "INSERT", schema: "public", table: "profiles", filter: `status=eq.pending` },
                    (payload) => {
                        announce();
                        const signup = payload.new as { full_name: string | null; role: string };
                        toast.message("New signup awaiting approval", {
                            description: signup.full_name ? `${signup.full_name} (${signup.role})` : signup.role,
                            action: { label: "Review", onClick: () => router.push("/admin/approvals") },
                        });
                    }
                )
                .on(
                    "postgres_changes",
                    { event: "INSERT", schema: "public", table: "uploads" },
                    (payload) => {
                        announce();
                        const upload = payload.new as { photo_type: string; task_title: string | null };
                        toast.message(`New ${upload.photo_type} photo uploaded`, {
                            description: upload.task_title ?? undefined,
                            action: { label: "View", onClick: () => router.push("/admin/uploads") },
                        });
                    }
                )
                .subscribe();
            channels.push(adminChannel);
        }

        return () => {
            channels.forEach((c) => supabase.removeChannel(c));
            if (arrivedTimeout.current) clearTimeout(arrivedTimeout.current);
        };
    }, [profileId, role, router]);

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
                            className={`relative inline-flex h-11 w-11 items-center justify-center rounded-xl border text-white/80 transition hover:bg-white/10 hover:text-white ${
                                unreadCount > 0
                                    ? "border-amber-400/30 bg-amber-400/10"
                                    : "border-white/10 bg-white/5"
                            }`}
                        >
                            <Bell size={18} className={justArrived ? "bell-ring" : ""} />
                            {unreadCount > 0 && (
                                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 animate-pulse items-center justify-center rounded-full bg-amber-400 px-1 text-[11px] font-bold text-black">
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
