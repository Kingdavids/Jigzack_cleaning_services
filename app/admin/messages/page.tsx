import { Megaphone } from "lucide-react";
import { requireDashboardAccess } from "@/lib/dashboard/requireDashboardAccess";
import { sendBroadcast, sendMessage } from "../actions";
import { deleteMessage, replyToMessage, sendMessageToAdmin } from "@/lib/messaging-actions";
import { loadMessages } from "@/lib/message-attachments";
import DashboardShell from "@/components/dashboard/DashboardShell";
import SectionCard from "@/components/dashboard/SectionCard";
import SendMessageForm from "@/components/dashboard/SendMessageForm";
import MessageThreadList, { type MessageRow } from "@/components/dashboard/MessageThreadList";
import StaffCustomerConversations from "@/components/dashboard/StaffCustomerConversations";
import { deletedProfileIds } from "@/lib/admin/deletedCustomers";
import ClearMessagesCard from "@/components/dashboard/ClearMessagesCard";
import { isOwner, isViewOnlyAdmin } from "@/lib/auth/roles";

export default async function AdminMessagesPage() {
    const { profile, supabase, unreadCount } = await requireDashboardAccess("admin");

    const { data: directoryData } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .in("role", ["employee", "customer"])
        .eq("status", "approved")
        .order("full_name", { ascending: true });

    const hidden = await deletedProfileIds(supabase);
    const directory = (directoryData ?? []).filter((p) => !hidden.has(p.id));

    const messagesData = await loadMessages((select) =>
        supabase
            .from("messages")
            .select(select)
            // Admins can technically read every message (messages_all_admin), but
            // each send fans out to one row per recipient -- loading them all
            // showed the same message once per admin and once per broadcast
            // recipient. Only this admin's own side of each conversation belongs
            // in their inbox.
            .or(`from_profile_id.eq.${profile.id},to_profile_id.eq.${profile.id}`)
            .order("created_at", { ascending: false })
            .limit(200)
    );

    const messages = (messagesData ?? []) as unknown as MessageRow[];
    // Supervisors can look at everything but may only write to the admins.
    const supervisor = isViewOnlyAdmin(profile);

    // Conversations between staff and customers. Admins can read every message,
    // and reading them here changes nothing for the people involved.
    const watchedColumns =
        "id, subject, body, created_at, parent_message_id, from_profile_id, to_profile_id, is_broadcast, from_profile:profiles!messages_from_profile_id_fkey(full_name, role), to_profile:profiles!messages_to_profile_id_fkey(full_name, role)";
    const watchedQuery = (select: string) =>
        supabase.from("messages").select(select).eq("is_broadcast", false).order("created_at", { ascending: false }).limit(300);

    let watchedResult = await watchedQuery(`${watchedColumns}, attachment_path, attachment_name`);
    if (watchedResult.error) watchedResult = await watchedQuery(watchedColumns);

    const watched = (watchedResult.data ?? []) as unknown as Parameters<typeof StaffCustomerConversations>[0]["messages"];

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

                    {supervisor ? (
                        <SendMessageForm action={sendMessageToAdmin} label="Send a message to the admins">
                            <p className="text-xs text-white/50">
                                As a supervisor you can message the admins. Everyone else can only be reached by an admin.
                            </p>
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
                    ) : (
                    <>
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
                        attachments={false}
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
                            Recipients can&apos;t reply to a broadcast. Use &quot;Send message&quot; above for a two-way conversation.
                        </p>
                    </SendMessageForm>
                    </>
                    )}
                </div>
            </SectionCard>

            <div className="mt-6">
                <SectionCard
                    title="Staff and customer conversations"
                    description="What staff and customers are saying to each other. This is a read-only view and nobody is notified."
                >
                    <StaffCustomerConversations messages={watched} />
                </SectionCard>
            </div>

            {isOwner(profile) && (
                <div className="mt-6">
                    <SectionCard title="Clear out messages" description="Owners only. For removing test messages.">
                        <ClearMessagesCard />
                    </SectionCard>
                </div>
            )}
        </DashboardShell>
    );
}
