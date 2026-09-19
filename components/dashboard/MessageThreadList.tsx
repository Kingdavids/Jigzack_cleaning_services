'use client';

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import type { MessageActionState } from "@/lib/messaging-actions";

export type MessageRow = {
    id: string;
    subject: string;
    body: string;
    created_at: string;
    parent_message_id: string | null;
    from_profile_id: string;
    to_profile_id: string;
    read_at?: string | null;
    from_profile: { full_name: string | null } | null;
    to_profile: { full_name: string | null } | null;
};

type ReplyAction = (prevState: MessageActionState, formData: FormData) => Promise<MessageActionState>;

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

    useEffect(() => {
        if (!state) return;

        if (state.success) {
            formRef.current?.reset();
        } else if (state.error) {
            toast.error(state.error);
        }
    }, [state]);

    return (
        <form ref={formRef} action={formAction} className="mt-3 flex gap-2">
            <input type="hidden" name="parentMessageId" value={parentId} />
            <input
                name="body"
                placeholder="Reply…"
                required
                className="h-9 flex-1 rounded-lg border border-white/10 bg-white/8 px-3 text-xs text-white outline-none placeholder:text-white/30"
            />
            <ReplySubmit />
        </form>
    );
}

function DeleteForm({
                         messageId,
                         deleteAction,
                     }: {
    messageId: string;
    deleteAction: (formData: FormData) => void;
}) {
    return (
        <form
            action={deleteAction}
            onSubmit={(e) => {
                if (!confirm("Delete this message?")) {
                    e.preventDefault();
                }
            }}
        >
            <input type="hidden" name="messageId" value={messageId} />
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
                            showSubject,
                        }: {
    message: MessageRow;
    currentProfileId: string;
    deleteAction: (formData: FormData) => void;
    showSubject: boolean;
}) {
    const canDelete = message.from_profile_id === currentProfileId;

    return (
        <div>
            <div className="flex items-start justify-between gap-3">
                {showSubject ? (
                    <p className="text-sm font-bold">{message.subject}</p>
                ) : (
                    <p className="text-xs font-semibold text-white/60">
                        {message.from_profile?.full_name ?? "You"}
                    </p>
                )}
                {canDelete && <DeleteForm messageId={message.id} deleteAction={deleteAction} />}
            </div>
            {showSubject && (
                <p className="mt-1 text-xs text-white/50">
                    {message.from_profile?.full_name ?? "You"} →{" "}
                    {message.to_profile?.full_name ?? "Admin"}
                </p>
            )}
            <p className="mt-2 text-sm text-white/70">{message.body}</p>
        </div>
    );
}

export default function MessageThreadList({
                                               messages,
                                               currentProfileId,
                                               replyAction,
                                               deleteAction,
                                           }: {
    messages: MessageRow[];
    currentProfileId: string;
    replyAction: ReplyAction;
    deleteAction: (formData: FormData) => void;
}) {
    const roots = messages.filter((m) => !m.parent_message_id);
    const repliesByRoot = new Map<string, MessageRow[]>();

    messages
        .filter((m) => m.parent_message_id)
        .forEach((m) => {
            const list = repliesByRoot.get(m.parent_message_id as string) ?? [];
            list.push(m);
            repliesByRoot.set(m.parent_message_id as string, list);
        });

    if (roots.length === 0) {
        return (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/50">
                No messages yet.
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {roots.map((root) => {
                const replies = (repliesByRoot.get(root.id) ?? []).sort(
                    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                );

                return (
                    <div key={root.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                        <MessageBubble
                            message={root}
                            currentProfileId={currentProfileId}
                            deleteAction={deleteAction}
                            showSubject
                        />

                        {replies.length > 0 && (
                            <div className="mt-3 space-y-3 border-l border-white/10 pl-4">
                                {replies.map((reply) => (
                                    <MessageBubble
                                        key={reply.id}
                                        message={reply}
                                        currentProfileId={currentProfileId}
                                        deleteAction={deleteAction}
                                        showSubject={false}
                                    />
                                ))}
                            </div>
                        )}

                        <ReplyForm parentId={root.id} replyAction={replyAction} />
                    </div>
                );
            })}
        </div>
    );
}
