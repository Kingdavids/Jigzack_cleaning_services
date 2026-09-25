import type { MessageRow } from "@/components/dashboard/MessageThreadList";
import AttachmentLink from "@/components/dashboard/AttachmentLink";

type WatchedMessage = Omit<MessageRow, "from_profile" | "to_profile"> & {
    from_profile: { full_name: string | null; role: string | null } | null;
    to_profile: { full_name: string | null; role: string | null } | null;
};

const when = (value: string) =>
    new Date(value).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const ROLE_LABEL: Record<string, string> = { admin: "admin", employee: "staff", customer: "customer" };

// A read-only view of conversations. It changes nothing: no read receipts, no
// notifications, so the people in them see no difference.
//
// "staff-customer" (the default) shows only staff and customers talking to each
// other, leaving out threads that involve an administrator because those already
// appear in the inbox above. "everyone" is for owners and shows every thread,
// including the ones between admins and customers or staff.
export default function StaffCustomerConversations({
                                                       messages,
                                                       scope = "staff-customer",
                                                   }: {
    messages: WatchedMessage[];
    scope?: "staff-customer" | "everyone";
}) {
    const everyone = scope === "everyone";

    const relevant = messages.filter((m) => {
        if (everyone) return true;
        const roles = [m.from_profile?.role, m.to_profile?.role];
        return roles.includes("employee") && roles.includes("customer");
    });

    // One message sent to several admins is stored once per admin. Show it once:
    // the first copy stands for the group, and replies to any copy join it.
    const canonicalRoot = new Map<string, string>();
    const firstOfGroup = new Map<string, string>();

    if (everyone) {
        const roots = relevant.filter((m) => !m.parent_message_id).sort((a, b) => a.created_at.localeCompare(b.created_at));

        for (const root of roots) {
            if (!root.group_id) continue;

            const first = firstOfGroup.get(root.group_id);
            if (first) canonicalRoot.set(root.id, first);
            else firstOfGroup.set(root.group_id, root.id);
        }
    }

    // Roots that stand for a message sent to several admins.
    const fanned = new Set(canonicalRoot.values());

    const rootOf = (id: string) => canonicalRoot.get(id) ?? id;

    const threads = new Map<string, WatchedMessage[]>();
    for (const message of relevant) {
        // The duplicate copies of a fan-out message add nothing.
        if (everyone && !message.parent_message_id && canonicalRoot.has(message.id)) continue;

        const key = rootOf(message.parent_message_id ?? message.id);
        threads.set(key, [...(threads.get(key) ?? []), message]);
    }

    const ordered = [...threads.values()]
        .map((list) => [...list].sort((a, b) => a.created_at.localeCompare(b.created_at)))
        .sort((a, b) => b[b.length - 1].created_at.localeCompare(a[a.length - 1].created_at));

    if (ordered.length === 0) {
        return <p className="text-sm text-white/50">{everyone ? "No conversations yet." : "No staff and customer conversations yet."}</p>;
    }

    return (
        <div className="space-y-4">
            {ordered.map((thread) => {
                const first = thread[0];
                const staff = [first.from_profile, first.to_profile].find((p) => p?.role === "employee");
                const customer = [first.from_profile, first.to_profile].find((p) => p?.role === "customer");
                const fannedOut = everyone && fanned.has(first.id);

                const label = everyone
                    ? `${first.from_profile?.full_name ?? "Unknown"} (${ROLE_LABEL[first.from_profile?.role ?? ""] ?? "user"}) to ${
                        fannedOut ? "all admins" : `${first.to_profile?.full_name ?? "Unknown"} (${ROLE_LABEL[first.to_profile?.role ?? ""] ?? "user"})`
                    }`
                    : `${staff?.full_name ?? "Staff"} and ${customer?.full_name ?? "customer"}`;

                return (
                    <div key={first.parent_message_id ?? first.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                        <p className="font-bold">{first.subject.replace(/^Re: /, "")}</p>
                        <p className="text-xs text-white/50">{label}</p>

                        <div className="mt-3 space-y-2">
                            {thread.map((message) => (
                                <div key={message.id} className="rounded-xl bg-black/25 px-3 py-2">
                                    <p className="text-xs text-white/45">
                                        {message.from_profile?.full_name ?? "Unknown"} · {when(message.created_at)}
                                    </p>
                                    <p className="mt-1 select-text whitespace-pre-wrap text-sm text-white/80 [-webkit-touch-callout:default] [-webkit-user-select:text]">{message.body}</p>
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
