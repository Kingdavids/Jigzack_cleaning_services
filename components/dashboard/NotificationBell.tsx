'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
    Bell,
    Camera,
    CheckCheck,
    ClipboardList,
    CreditCard,
    FileText,
    History,
    MessageSquare,
    Receipt,
    UserPlus,
    Volume2,
    VolumeX,
    Wallet,
    type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/utils/supabase/client";
import {
    isSoundOn,
    playNotificationSound,
    setSoundOn,
    unlockNotificationSound,
    vibrateForNotification,
} from "@/lib/notification-sound";

type NotificationRow = {
    id: string;
    kind: string;
    title: string;
    body: string | null;
    href: string | null;
    created_at: string;
    read_at: string | null;
};

const KIND_ICON: Record<string, LucideIcon> = {
    message: MessageSquare,
    invoice: FileText,
    receipt: Receipt,
    payment: CreditCard,
    task: ClipboardList,
    photos: Camera,
    signup: UserPlus,
    expense: Wallet,
    activity: History,
};

const PAGE = 30;

function timeAgo(value: string) {
    const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));

    if (seconds < 45) return "just now";
    if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))} min ago`;
    if (seconds < 86_400) return `${Math.round(seconds / 3600)} h ago`;
    if (seconds < 7 * 86_400) return `${Math.round(seconds / 86_400)} d ago`;

    return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// The bell. It lists everything the person should know about (messages,
// invoices, receipts, tasks, photos and, for admins, what has changed), and
// rings, pops up and buzzes when something new arrives. It works the same on a
// phone: the sound is unlocked by the first tap, missed items are caught up
// when the app comes back to the front, and installed apps get a badge.
export default function NotificationBell({
                                             profileId,
                                             onUnavailable,
                                         }: {
    profileId: string;
    // Called when the notifications table does not exist yet, so the caller can fall back.
    onUnavailable: () => void;
}) {
    const router = useRouter();
    const supabase = useMemo(() => createClient(), []);
    const [items, setItems] = useState<NotificationRow[]>([]);
    const [unread, setUnread] = useState(0);
    const [open, setOpen] = useState(false);
    const [top, setTop] = useState(72);
    const [ringing, setRinging] = useState(false);
    const [soundOn, setSoundState] = useState(true);
    const bellRef = useRef<HTMLButtonElement>(null);
    const seen = useRef<Set<string>>(new Set());
    const ready = useRef(false);
    const ringTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const openItem = useCallback(
        async (row: NotificationRow) => {
            setOpen(false);

            if (!row.read_at) {
                setItems((prev) => prev.map((n) => (n.id === row.id ? { ...n, read_at: new Date().toISOString() } : n)));
                setUnread((c) => Math.max(0, c - 1));
                await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", row.id);
            }

            if (row.href) router.push(row.href);
        },
        [router, supabase]
    );

    // Popup, chime, buzz and a bell shake. One popup for a burst.
    const announce = useCallback(
        (fresh: NotificationRow[]) => {
            if (fresh.length === 0) return;

            setRinging(true);
            if (ringTimer.current) clearTimeout(ringTimer.current);
            ringTimer.current = setTimeout(() => setRinging(false), 1600);

            playNotificationSound();
            vibrateForNotification();

            const latest = fresh[0];

            if (fresh.length === 1) {
                toast.message(latest.title, {
                    description: latest.body ?? undefined,
                    duration: 8000,
                    action: latest.href ? { label: "View", onClick: () => void openItem(latest) } : undefined,
                });
            } else {
                toast.message(`${fresh.length} new notifications`, {
                    description: latest.title,
                    duration: 8000,
                    action: { label: "Open", onClick: () => setOpen(true) },
                });
            }
        },
        [openItem]
    );

    const load = useCallback(async () => {
        const [list, count] = await Promise.all([
            supabase
                .from("notifications")
                .select("id, kind, title, body, href, created_at, read_at")
                .eq("recipient_id", profileId)
                .order("created_at", { ascending: false })
                .limit(PAGE),
            supabase.from("notifications").select("id", { count: "exact", head: true }).eq("recipient_id", profileId).is("read_at", null),
        ]);

        if (list.error) {
            // Only a missing table means the SQL has not been run. A dropped connection
            // should just try again on the next refresh.
            if (/42P01|PGRST205|schema cache|does not exist|could not find the table/i.test(`${list.error.code} ${list.error.message}`)) {
                onUnavailable();
            }
            return;
        }

        const rows = (list.data ?? []) as NotificationRow[];

        // After the first load, anything unread that we have not shown yet arrived
        // while the page was asleep (a phone with the screen off, a background tab).
        if (ready.current) {
            announce(rows.filter((row) => !row.read_at && !seen.current.has(row.id)));
        }

        rows.forEach((row) => seen.current.add(row.id));
        ready.current = true;

        setItems(rows);
        setUnread(count.count ?? rows.filter((row) => !row.read_at).length);
    }, [announce, onUnavailable, profileId, supabase]);

    useEffect(() => {
        const start = window.setTimeout(() => {
            setSoundState(isSoundOn());
            void load();
        }, 0);

        const channel = supabase
            .channel(`notifications-${profileId}`)
            .on(
                "postgres_changes",
                { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${profileId}` },
                (payload) => {
                    const row = payload.new as NotificationRow;
                    if (seen.current.has(row.id)) return;

                    seen.current.add(row.id);
                    setItems((prev) => [row, ...prev].slice(0, PAGE));
                    setUnread((c) => c + 1);
                    announce([row]);
                }
            )
            .on(
                "postgres_changes",
                { event: "UPDATE", schema: "public", table: "notifications", filter: `recipient_id=eq.${profileId}` },
                (payload) => {
                    // Read on another device or tab: keep this one in step.
                    const row = payload.new as NotificationRow;
                    setItems((prev) => prev.map((n) => (n.id === row.id ? { ...n, read_at: row.read_at } : n)));
                    void supabase
                        .from("notifications")
                        .select("id", { count: "exact", head: true })
                        .eq("recipient_id", profileId)
                        .is("read_at", null)
                        .then(({ count }) => setUnread(count ?? 0));
                }
            )
            .subscribe();

        // Phones put the connection to sleep with the screen. When the app comes
        // back, and every so often while it is open, catch up on anything missed.
        const refresh = () => {
            if (document.visibilityState === "visible") void load();
        };

        document.addEventListener("visibilitychange", refresh);
        window.addEventListener("focus", refresh);
        window.addEventListener("online", refresh);
        const poll = window.setInterval(refresh, 45_000);

        // Sound is only allowed after the first touch on a phone.
        const unlock = () => unlockNotificationSound();
        window.addEventListener("pointerdown", unlock, { once: true, passive: true });
        window.addEventListener("keydown", unlock, { once: true });

        return () => {
            window.clearTimeout(start);
            window.clearInterval(poll);
            document.removeEventListener("visibilitychange", refresh);
            window.removeEventListener("focus", refresh);
            window.removeEventListener("online", refresh);
            window.removeEventListener("pointerdown", unlock);
            window.removeEventListener("keydown", unlock);
            supabase.removeChannel(channel);
            if (ringTimer.current) clearTimeout(ringTimer.current);
        };
    }, [announce, load, profileId, supabase]);

    // The number on the app icon, for installed apps that support it.
    useEffect(() => {
        const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };

        try {
            if (unread > 0) void nav.setAppBadge?.(unread);
            else void nav.clearAppBadge?.();
        } catch {
            // Not supported; nothing to do.
        }
    }, [unread]);

    useEffect(() => {
        if (!open) return;

        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") setOpen(false);
        };

        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open]);

    const toggle = () => {
        const rect = bellRef.current?.getBoundingClientRect();
        if (rect) setTop(Math.round(rect.bottom + 8));
        setOpen((value) => !value);
    };

    const markAllRead = async () => {
        const now = new Date().toISOString();
        setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })));
        setUnread(0);
        await supabase.from("notifications").update({ read_at: now }).eq("recipient_id", profileId).is("read_at", null);
    };

    const toggleSound = () => {
        const next = !soundOn;
        setSoundState(next);
        setSoundOn(next);
        if (next) {
            unlockNotificationSound();
            playNotificationSound();
        }
    };

    return (
        <>
            <button
                ref={bellRef}
                type="button"
                onClick={toggle}
                aria-label={unread > 0 ? `${unread} unread notifications` : "Notifications"}
                aria-expanded={open}
                className={`relative inline-flex h-11 w-11 items-center justify-center rounded-xl border text-white/80 transition hover:bg-white/10 hover:text-white ${
                    unread > 0 ? "border-amber-400/30 bg-amber-400/10" : "border-white/10 bg-white/5"
                }`}
            >
                <Bell size={18} className={ringing ? "bell-ring" : ""} />
                {unread > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-5 min-w-5 animate-pulse items-center justify-center rounded-full bg-amber-400 px-1 text-[11px] font-bold text-black">
                        {unread > 9 ? "9+" : unread}
                    </span>
                )}
            </button>

            {open &&
                typeof document !== "undefined" &&
                createPortal(
                    <>
                        <div className="fixed inset-0 z-[55]" onClick={() => setOpen(false)} aria-hidden="true" />
                        <div
                            role="dialog"
                            aria-label="Notifications"
                            style={{ top }}
                            className="fixed left-3 right-3 z-[60] max-h-[75vh] overflow-hidden rounded-2xl border border-white/10 bg-[#141518] text-white shadow-2xl sm:left-auto sm:right-6 sm:w-[24rem]"
                        >
                            <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
                                <p className="font-bold">Notifications</p>
                                <div className="flex items-center gap-1">
                                    <button
                                        type="button"
                                        onClick={toggleSound}
                                        aria-label={soundOn ? "Turn sound off" : "Turn sound on"}
                                        className="flex h-9 w-9 items-center justify-center rounded-lg text-white/60 transition hover:bg-white/10 hover:text-white"
                                    >
                                        {soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={markAllRead}
                                        disabled={unread === 0}
                                        className="flex h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-amber-300 transition hover:bg-white/10 disabled:opacity-40"
                                    >
                                        <CheckCheck size={14} />
                                        Mark all read
                                    </button>
                                </div>
                            </div>

                            <div className="max-h-[calc(75vh-3.5rem)] overflow-y-auto overscroll-contain">
                                {items.length === 0 ? (
                                    <p className="px-4 py-10 text-center text-sm text-white/50">Nothing yet. New activity shows up here.</p>
                                ) : (
                                    <ul>
                                        {items.map((row) => {
                                            const Icon = KIND_ICON[row.kind] ?? Bell;

                                            return (
                                                <li key={row.id} className="border-b border-white/5 last:border-b-0">
                                                    <button
                                                        type="button"
                                                        onClick={() => void openItem(row)}
                                                        className={`flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-white/[0.06] ${
                                                            row.read_at ? "" : "bg-amber-400/[0.06]"
                                                        }`}
                                                    >
                                                        <span
                                                            className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                                                                row.read_at ? "bg-white/10 text-white/60" : "bg-amber-400/20 text-amber-300"
                                                            }`}
                                                        >
                                                            <Icon size={16} />
                                                        </span>
                                                        <span className="min-w-0 flex-1">
                                                            <span className={`block text-sm ${row.read_at ? "text-white/75" : "font-bold text-white"}`}>
                                                                {row.title}
                                                            </span>
                                                            {row.body && <span className="mt-0.5 line-clamp-2 block text-xs text-white/55">{row.body}</span>}
                                                            <span className="mt-1 block text-[11px] text-white/35">{timeAgo(row.created_at)}</span>
                                                        </span>
                                                        {!row.read_at && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-amber-400" />}
                                                    </button>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                            </div>
                        </div>
                    </>,
                    document.body
                )}
        </>
    );
}
