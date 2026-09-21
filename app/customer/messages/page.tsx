import { requireDashboardAccess } from "@/lib/dashboard/requireDashboardAccess";
import { deleteMessage, replyToMessage, sendMessageToAdmin } from "@/lib/messaging-actions";
import DashboardShell from "@/components/dashboard/DashboardShell";
import SectionCard from "@/components/dashboard/SectionCard";
import SendMessageForm from "@/components/dashboard/SendMessageForm";
import MessageThreadList, { type MessageRow } from "@/components/dashboard/MessageThreadList";
import MarkMessagesReadOnView from "@/components/dashboard/MarkMessagesReadOnView";

export default async function CustomerMessagesPage() {
    const { profile, supabase, unreadCount } = await requireDashboardAccess("customer");

    const { data: messagesData } = await supabase
        .from("messages")
        .select(
            "id, subject, body, created_at, parent_message_id, from_profile_id, to_profile_id, read_at, from_profile:profiles!messages_from_profile_id_fkey(full_name), to_profile:profiles!messages_to_profile_id_fkey(full_name)"
        )
        .or(`from_profile_id.eq.${profile.id},to_profile_id.eq.${profile.id}`)
        .order("created_at", { ascending: false })
        .limit(50);

    const messages = (messagesData ?? []) as unknown as MessageRow[];

    return (
        <DashboardShell
            role="customer"
            profileId={profile.id}
            title="Messages"
            subtitle="Contact the Jigzack team."
            unreadCount={unreadCount}
        >
            <MarkMessagesReadOnView unreadCount={unreadCount} />

            <SectionCard title="Messages" description="Contact the Jigzack team">
                <div className="space-y-4">
                    <MessageThreadList
                        messages={messages}
                        currentProfileId={profile.id}
                        replyAction={replyToMessage}
                        deleteAction={deleteMessage}
                    />

                    <SendMessageForm action={sendMessageToAdmin} label="Send a message to Admin">
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
                </div>
            </SectionCard>
        </DashboardShell>
    );
}
