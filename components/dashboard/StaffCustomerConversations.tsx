import type { MessageRow } from "@/components/dashboard/MessageThreadList";
import AttachmentLink from "@/components/dashboard/AttachmentLink";

type WatchedMessage = Omit<MessageRow, "from_profile" | "to_profile"> & {
    from_profile: { full_name: string | null; role: string | null } | null;
    to_profile: { full_name: string | null; role: string | null } | null;
};

const when = (value: string) =>
    new Date(value).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

// A read-only view of conversations between staff and customers. It changes
// nothing: no read receipts, no notifications, so the people in them see no
// difference. Threads that involve an administrator are left out, because
// those already appear in the inbox above.
export default function StaffCustomerConversations({ messages }: { messages: WatchedMessage[] }) {
    const relevant = messages.filter((m) => {
        const roles = [m.from_profile?.role, m.to_profile?.role];
        return roles.includes("employee") && roles.includes("customer");
    });

    const threads = new Map<string, WatchedMessage[]>();
    for (const message of relevant) {
        const key = message.parent_message_id ?? message.id;
        threads.set(key, [...(threads.get(key) ?? []), message]);
    }

    const ordered = [...threads.values()]
        .map((list) => [...list].sort((a, b) => a.created_at.localeCompare(b.created_at)))
        .sort((a, b) => b[b.length - 1].created_at.localeCompare(a[a.length - 1].created_at));

    if (ordered.length === 0) {
        return <p className="text-sm text-white/50">No staff and customer conversations yet.</p>;
    }

    return (
        <div className="space-y-4">
            {ordered.map((thread) => {
                const first = thread[0];
                const staff = [first.from_profile, first.to_profile].find((p) => p?.role === "employee");
                const customer = [first.from_profile, first.to_profile].find((p) => p?.role === "customer");

                return (
                    <div key={first.parent_message_id ?? first.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                        <p className="font-bold">{first.subject.replace(/^Re: /, "")}</p>
                        <p className="text-xs text-white/50">
                            {staff?.full_name ?? "Staff"} and {customer?.full_name ?? "customer"}
                        </p>

                        <div className="mt-3 space-y-2">
                            {thread.map((message) => (
                                <div key={message.id} className="rounded-xl bg-black/25 px-3 py-2">
                                    <p className="text-xs text-white/45">
                                        {message.from_profile?.full_name ?? "Unknown"} · {when(message.created_at)}
                                    </p>
                                    <p className="mt-1 whitespace-pre-wrap text-sm text-white/80">{message.body}</p>
                                    {message.attachment_path && (
                                        <AttachmentLink path={message.attachment_path} name={message.attachment_name ?? null} />
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
