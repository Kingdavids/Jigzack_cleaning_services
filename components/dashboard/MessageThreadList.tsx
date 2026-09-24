'use client';

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { ChevronDown, Megaphone, Paperclip, Trash2 } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { markThreadRead, type MessageActionState } from "@/lib/messaging-actions";
import { MESSAGE_SELECT, MESSAGE_SELECT_BASE } from "@/lib/message-select";
import AttachmentLink from "@/components/dashboard/AttachmentLink";

export type MessageRow = {
    id: string;
    subject: string;
    body: string;
    created_at: string;
    parent_message_id: string | null;
    from_profile_id: string;
    to_profile_id: string;
    read_at?: string | null;
    is_broadcast?: boolean;
    group_id?: string | null;
    attachment_path?: string | null;
    attachment_name?: string | null;
    from_profile: { full_name: string | null } | null;
    to_profile: { full_name: string | null } | null;
};

type ReplyAction = (prevState: MessageActionState, formData: FormData) => Promise<MessageActionState>;

const PAGE_SIZE = 8;

function formatWhen(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    const now = new Date();
    const sameDay = date.toDateString() === now.toDateString();

    if (sameDay) {
        return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    }

    return date.toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

function initialsFor(name: string | null | undefined) {
    const trimmed = (name ?? "").trim();
    if (!trimmed) return "?";
    const parts = trimmed.split(/\s+/);
    return parts.length === 1
        ? parts[0].slice(0, 2).toUpperCase()
        : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function Avatar({ name, tone = "neutral" }: { name: string | null | undefined; tone?: "mine" | "neutral" | "broadcast" }) {
    const styles =
        tone === "mine"
            ? "bg-amber-400 text-black"
            : tone === "broadcast"
                ? "bg-sky-400/15 text-sky-300"
                : "bg-white/10 text-white/70";

    return (
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${styles}`}>
            {initialsFor(name)}
        </div>
    );
}

function ReplySubmit() {
    const { pending } = useFormStatus();

    return (
        <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-bold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
            {pending ? "Sending…" : "Reply"}
        </button>
    );
}

function ReplyForm({ parentId, replyAction }: { parentId: string; replyAction: ReplyAction }) {
    const [state, formAction] = useActionState<MessageActionState, FormData>(replyAction, null);
    const formRef = useRef<HTMLFormElement>(null);
    const [fileName, setFileName] = useState<string | null>(null);

    useEffect(() => {
        if (!state) return;

        if (state.success) {
            formRef.current?.reset();
        } else if (state.error) {
            toast.error(state.error);
        }
    }, [state]);

    return (
        <form
            ref={formRef}
            action={formAction}
            onReset={() => setFileName(null)}
            onClick={(e) => e.stopPropagation()}
            className="mt-3"
        >
            <div className="flex gap-2">
                <input type="hidden" name="parentMessageId" value={parentId} />
                <input
                    name="body"
                    placeholder="Reply…"
                    required
                    className="h-9 min-w-0 flex-1 rounded-lg border border-white/10 bg-white/8 px-3 text-xs text-white outline-none placeholder:text-white/30"
                />
                <label
                    title="Attach a photo or PDF"
                    className={`flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border transition ${
                        fileName
                            ? "border-amber-400/50 bg-amber-400/10 text-amber-300"
                            : "border-white/10 bg-white/8 text-white/60 hover:text-white"
                    }`}
                >
                    <Paperclip className="h-4 w-4" />
                    <span className="sr-only">Attach a photo or PDF</span>
                    <input
                        type="file"
                        name="attachment"
                        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
                        onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
                        className="sr-only"
                    />
                </label>
                <ReplySubmit />
            </div>
            {fileName && <p className="mt-1.5 truncate text-[11px] text-amber-300/80">Attached: {fileName}</p>}
        </form>
    );
}

function DeleteForm({
                         messageId,
                         groupId,
                         deleteAction,
                     }: {
    messageId: string;
    groupId?: string | null;
    deleteAction: (formData: FormData) => void;
}) {
    return (
        <form
            action={deleteAction}
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
                if (!confirm("Delete this message?")) {
                    e.preventDefault();
                }
            }}
        >
            <input type="hidden" name="messageId" value={messageId} />
            {groupId && <input type="hidden" name="groupId" value={groupId} />}
            <button
                type="submit"
                aria-label="Delete message"
                className="text-white/30 transition hover:text-red-300"
            >
                <Trash2 className="h-3.5 w-3.5" />
            </button>
        </form>
    );
}

function MessageBubble({
                            message,
                            currentProfileId,
                            deleteAction,
                            deleteGroupId,
                        }: {
    message: MessageRow;
    currentProfileId: string;
    deleteAction: (formData: FormData) => void;
    deleteGroupId?: string | null;
}) {
    const isMine = message.from_profile_id === currentProfileId;

    return (
        <div className={`flex items-end gap-2 ${isMine ? "flex-row-reverse" : "flex-row"}`}>
            {!isMine && <Avatar name={message.from_profile?.full_name} />}

            <div className={`flex max-w-[78%] flex-col ${isMine ? "items-end" : "items-start"}`}>
                {!isMine && (
                    <p className="mb-1 px-1 text-xs font-semibold text-white/50">
                        {message.from_profile?.full_name ?? "Unknown"}
                    </p>
                )}

                <div
                    className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed break-words shadow-sm ${
                        isMine
                            ? "rounded-br-sm bg-amber-400 text-black"
                            : "rounded-bl-sm border border-white/10 bg-white/[0.06] text-white/85"
                    }`}
                >
                    {message.body}
                    {message.attachment_path && (
                        <AttachmentLink
                            path={message.attachment_path}
                            name={message.attachment_name ?? null}
                            tone={isMine ? "dark" : "light"}
                        />
                    )}
                </div>

                <div className="mt-1 flex items-center gap-2 px-1">
                    <span className="text-[11px] text-white/40">{formatWhen(message.created_at)}</span>
                    {isMine && <DeleteForm messageId={message.id} groupId={deleteGroupId} deleteAction={deleteAction} />}
                </div>
            </div>
        </div>
    );
}

export default function MessageThreadList({
                                               messages: initialMessages,
                                               currentProfileId,
                                               replyAction,
                                               deleteAction,
                                           }: {
    messages: MessageRow[];
    currentProfileId: string;
    replyAction: ReplyAction;
    deleteAction: (formData: FormData) => void;
}) {
    const [messages, setMessages] = useState(initialMessages);
    const [openThreadId, setOpenThreadId] = useState<string | null>(null);
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

    useEffect(() => {
        setMessages(initialMessages);
    }, [initialMessages]);

    // Live-updates the thread list as messages arrive or get deleted, instead
    // of requiring a page reload to see anything sent/received after load.
    useEffect(() => {
        const supabase = createClient();

        // A raw postgres_changes payload only has the bare message row --
        // no from_profile/to_profile names -- so re-fetch it with the same
        // embedded select the initial page load used before adding it in.
        const fetchAndAdd = async (id: string) => {
            let { data } = await supabase.from("messages").select(MESSAGE_SELECT).eq("id", id).single();

            // Before the attachments SQL has been run, the extra columns do not exist.
            if (!data) ({ data } = await supabase.from("messages").select(MESSAGE_SELECT_BASE).eq("id", id).single());

            if (!data) return;

            const row = data as unknown as MessageRow;
            setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
        };

        const channel = supabase
            .channel(`messages-thread-list-${currentProfileId}`)
            .on(
                "postgres_changes",
                { event: "INSERT", schema: "public", table: "messages", filter: `to_profile_id=eq.${currentProfileId}` },
                // Stays unread until the thread is actually opened -- arriving
                // while the list happens to be on screen doesn't count.
                (payload) => fetchAndAdd((payload.new as { id: string }).id)
            )
            .on(
                "postgres_changes",
                { event: "INSERT", schema: "public", table: "messages", filter: `from_profile_id=eq.${currentProfileId}` },
                (payload) => fetchAndAdd((payload.new as { id: string }).id)
            )
            .on(
                "postgres_changes",
                { event: "DELETE", schema: "public", table: "messages" },
                (payload) => {
                    const deletedId = (payload.old as { id?: string }).id;
                    if (!deletedId) return;
                    setMessages((prev) => prev.filter((m) => m.id !== deletedId));
                }
            )
            .on(
                "postgres_changes",
                { event: "UPDATE", schema: "public", table: "messages", filter: `to_profile_id=eq.${currentProfileId}` },
                (payload) => {
                    const updated = payload.new as { id: string; read_at: string | null };
                    setMessages((prev) =>
                        prev.map((m) => (m.id === updated.id ? { ...m, read_at: updated.read_at } : m))
                    );
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [currentProfileId]);

    const repliesByRoot = useMemo(() => {
        const map = new Map<string, MessageRow[]>();
        messages
            .filter((m) => m.parent_message_id)
            .forEach((m) => {
                const list = map.get(m.parent_message_id as string) ?? [];
                list.push(m);
                map.set(m.parent_message_id as string, list);
            });
        return map;
    }, [messages]);

    const roots = useMemo(() => {
        // One send to several recipients (broadcast, or a message to every
        // admin) creates one row per recipient. The sender sees them as ONE
        // card; each recipient only ever has their own row, so they're
        // unaffected.
        const groups = new Map<string, MessageRow[]>();

        messages
            .filter((m) => !m.parent_message_id)
            .forEach((m) => {
                const key = m.group_id && m.from_profile_id === currentProfileId ? `g:${m.group_id}` : `r:${m.id}`;
                const list = groups.get(key) ?? [];
                list.push(m);
                groups.set(key, list);
            });

        return Array.from(groups.values())
            .map((groupRoots) => {
                const sortedRoots = [...groupRoots].sort(
                    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                );
                const root = sortedRoots[0];
                const rootIds = sortedRoots.map((r) => r.id);

                const replies = sortedRoots
                    .flatMap((r) => repliesByRoot.get(r.id) ?? [])
                    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

                const latest = replies.length > 0 ? replies[replies.length - 1] : root;
                // Any message in the thread addressed to me can be the unread
                // one -- not just the root -- otherwise a fresh reply on an
                // already-read thread would never show as unread.
                const isUnread = [...sortedRoots, ...replies].some(
                    (m) => m.to_profile_id === currentProfileId && !m.read_at
                );
                // Replying continues with whoever answered last; before any
                // answer it goes to the first recipient.
                const replyParentId = latest.parent_message_id ?? root.id;

                return {
                    root,
                    rootIds,
                    replies,
                    latest,
                    isUnread,
                    groupSize: sortedRoots.length,
                    replyParentId,
                    groupId: sortedRoots.length > 1 ? root.group_id ?? null : null,
                };
            })
            .sort((a, b) => new Date(b.latest.created_at).getTime() - new Date(a.latest.created_at).getTime());
    }, [repliesByRoot, messages, currentProfileId]);

    if (roots.length === 0) {
        return (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center text-sm text-white/50">
                No messages yet.
            </div>
        );
    }

    const visibleRoots = roots.slice(0, visibleCount);
    const remaining = roots.length - visibleRoots.length;

    const handleToggleThread = (rootId: string, rootIds: string[], isUnread: boolean) => {
        const opening = openThreadId !== rootId;
        setOpenThreadId(opening ? rootId : null);

        if (opening && isUnread) {
            const now = new Date().toISOString();
            setMessages((prev) =>
                prev.map((m) =>
                    (rootIds.includes(m.id) || (m.parent_message_id !== null && rootIds.includes(m.parent_message_id))) &&
                    m.to_profile_id === currentProfileId &&
                    !m.read_at
                        ? { ...m, read_at: now }
                        : m
                )
            );
            rootIds.forEach((id) => markThreadRead(id));
        }
    };

    return (
        <div className="space-y-3">
            {visibleRoots.map(({ root, rootIds, replies, latest, isUnread, groupSize, replyParentId, groupId }) => {
                const isOpen = openThreadId === root.id;
                const isBroadcast = Boolean(root.is_broadcast);
                const isMineRoot = root.from_profile_id === currentProfileId;
                const counterpart =
                    groupSize > 1
                        ? isBroadcast
                            ? `${groupSize} recipients`
                            : `All admins (${groupSize})`
                        : isMineRoot
                            ? root.to_profile?.full_name
                            : root.from_profile?.full_name;
                const avatarName = isBroadcast
                    ? "Broadcast"
                    : groupSize > 1
                        ? "Admins"
                        : isMineRoot
                            ? root.to_profile?.full_name
                            : root.from_profile?.full_name;

                return (
                    <div
                        key={root.id}
                        className={`overflow-hidden rounded-2xl border transition ${
                            isOpen ? "shadow-lg shadow-black/20" : ""
                        } ${
                            isUnread
                                ? "border-amber-400/30 bg-amber-400/[0.06] hover:border-amber-400/50"
                                : "border-white/10 bg-white/[0.03] hover:border-white/20"
                        }`}
                    >
                        <button
                            type="button"
                            onClick={() => handleToggleThread(root.id, rootIds, isUnread)}
                            className="flex w-full items-start gap-3 p-4 text-left"
                        >
                            {isBroadcast ? (
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-400/15 text-sky-300">
                                    <Megaphone className="h-4 w-4" />
                                </div>
                            ) : (
                                <Avatar name={avatarName} />
                            )}

                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                    {isUnread && (
                                        <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400 shadow-[0_0_0_3px_rgba(251,191,36,0.2)]" />
                                    )}
                                    <p
                                        className={`truncate text-sm ${
                                            isUnread ? "font-bold text-white" : "font-medium text-white/70"
                                        }`}
                                    >
                                        {root.subject}
                                    </p>
                                    {isBroadcast && (
                                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-sky-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-300">
                                            Broadcast
                                        </span>
                                    )}
                                    {replies.length > 0 && (
                                        <span className="shrink-0 text-xs text-white/40">
                                            ({replies.length + 1})
                                        </span>
                                    )}
                                </div>
                                <p className="mt-1 truncate text-xs text-white/50">
                                    {counterpart ?? "Unknown"}
                                </p>
                                <p
                                    className={`mt-1 truncate text-sm ${
                                        isUnread ? "text-white/75" : "text-white/40"
                                    }`}
                                >
                                    {latest.body}
                                </p>
                            </div>

                            <div className="flex shrink-0 flex-col items-end gap-2">
                                <span
                                    className={`text-xs ${isUnread ? "font-semibold text-amber-300" : "text-white/40"}`}
                                >
                                    {formatWhen(latest.created_at)}
                                </span>
                                <ChevronDown
                                    className={`h-4 w-4 text-white/40 transition-transform duration-300 ${
                                        isOpen ? "rotate-180" : ""
                                    }`}
                                />
                            </div>
                        </button>

                        <div
                            className={`grid transition-[grid-template-rows] duration-300 ease-out ${
                                isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                            }`}
                        >
                            <div className="overflow-hidden">
                                <div className="space-y-4 border-t border-white/10 p-4">
                                    <div className="space-y-3">
                                        <MessageBubble
                                            message={root}
                                            currentProfileId={currentProfileId}
                                            deleteAction={deleteAction}
                                            deleteGroupId={groupId}
                                        />

                                        {replies.map((reply) => (
                                            <MessageBubble
                                                key={reply.id}
                                                message={reply}
                                                currentProfileId={currentProfileId}
                                                deleteAction={deleteAction}
                                            />
                                        ))}
                                    </div>

                                    {isBroadcast ? (
                                        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs text-white/45">
                                            <Megaphone className="h-3.5 w-3.5 shrink-0" />
                                            Broadcast message. Replies aren&apos;t available.
                                        </div>
                                    ) : (
                                        <ReplyForm parentId={replyParentId} replyAction={replyAction} />
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })}

            {remaining > 0 && (
                <button
                    type="button"
                    onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                    className="w-full rounded-xl border border-white/10 bg-white/[0.03] py-3 text-sm font-semibold text-white/60 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
                >
                    Show {Math.min(remaining, PAGE_SIZE)} more ({remaining} remaining)
                </button>
            )}
        </div>
    );
}
