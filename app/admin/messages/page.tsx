import { Megaphone } from "lucide-react";
import { requireDashboardAccess } from "@/lib/dashboard/requireDashboardAccess";
import { sendBroadcast, sendMessage } from "../actions";
import { deleteMessage, replyToMessage } from "@/lib/messaging-actions";
import DashboardShell from "@/components/dashboard/DashboardShell";
import SectionCard from "@/components/dashboard/SectionCard";
import SendMessageForm from "@/components/dashboard/SendMessageForm";
import MessageThreadList, { type MessageRow } from "@/components/dashboard/MessageThreadList";

export default async function AdminMessagesPage() {
    const { profile, supabase, unreadCount } = await requireDashboardAccess("admin");

    const { data: directoryData } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .in("role", ["employee", "customer"])
        .eq("status", "approved")
        .order("full_name", { ascending: true });

    const directory = directoryData ?? [];

    const { data: messagesData } = await supabase
        .from("messages")
        .select(
            "id, subject, body, created_at, parent_message_id, from_profile_id, to_profile_id, read_at, is_broadcast, from_profile:profiles!messages_from_profile_id_fkey(full_name), to_profile:profiles!messages_to_profile_id_fkey(full_name)"
        )
        .order("created_at", { ascending: false })
        .limit(50);

    const messages = (messagesData ?? []) as unknown as MessageRow[];

    return (
        <DashboardShell
            role="admin"
            profileId={profile.id}
            title="Messages"
            subtitle="Recent communication."
            unreadCount={unreadCount}
        >
            <SectionCard title="Messages" description="Recent communication">
                <div className="space-y-4">
                    <MessageThreadList
                        messages={messages}
                        currentProfileId={profile.id}
                        replyAction={replyToMessage}
                        deleteAction={deleteMessage}
                    />

                    <SendMessageForm action={sendMessage} label="Send message">
                        <select
                            name="toProfileId"
                            required
                            defaultValue=""
                            className="h-11 w-full rounded-xl border border-white/10 bg-[#141518] px-3 text-sm text-white outline-none"
                        >
                            <option value="" disabled>
                                Select recipient
                            </option>
                            {directory.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.full_name} ({p.role})
                                </option>
                            ))}
                        </select>

                        <input
                            name="subject"
                            placeholder="Subject"
                            required
                            className="h-11 w-full rounded-xl border border-white/10 bg-white/8 px-3 text-sm text-white outline-none placeholder:text-white/30"
                        />

                        <textarea
                            name="body"
                            placeholder="Message"
                            required
                            className="min-h-[90px] w-full rounded-xl border border-white/10 bg-white/8 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30"
                        />
                    </SendMessageForm>

                    <SendMessageForm
                        action={sendBroadcast}
                        label="Broadcast to everyone"
                        submitLabel="Send Broadcast"
                        submitPendingLabel="Broadcasting…"
                        successMessage="Broadcast sent"
                        className="space-y-3 rounded-xl border border-sky-400/20 bg-gradient-to-b from-sky-400/[0.06] to-transparent p-4"
                    >
                        <div className="flex items-center gap-2 text-sky-300">
                            <Megaphone className="h-4 w-4" />
                            <p className="text-xs font-semibold uppercase tracking-[0.2em]">
                                One-way announcement
                            </p>
                        </div>

                        <select
                            name="audience"
                            required
                            defaultValue=""
                            className="h-11 w-full rounded-xl border border-white/10 bg-[#141518] px-3 text-sm text-white outline-none"
                        >
                            <option value="" disabled>
                                Select audience
                            </option>
                            <option value="all_customers">All Customers</option>
                            <option value="all_employees">All Employees</option>
                            <option value="everyone">Everyone (Customers &amp; Employees)</option>
                        </select>

                        <input
                            name="subject"
                            placeholder="Subject"
                            required
                            className="h-11 w-full rounded-xl border border-white/10 bg-white/8 px-3 text-sm text-white outline-none placeholder:text-white/30"
                        />

                        <textarea
                            name="body"
                            placeholder="Announcement"
                            required
                            className="min-h-[90px] w-full rounded-xl border border-white/10 bg-white/8 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30"
                        />

                        <p className="text-xs text-white/40">
                            Recipients can&apos;t reply to a broadcast — use &quot;Send message&quot; above for a two-way conversation.
                        </p>
                    </SendMessageForm>
                </div>
            </SectionCard>
        </DashboardShell>
    );
}
