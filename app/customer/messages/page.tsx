import { requireDashboardAccess } from "@/lib/dashboard/requireDashboardAccess";
import { deleteMessage, replyToMessage, sendMessageToAdmin, sendMessageToEmployee } from "@/lib/messaging-actions";
import { formatDate } from "@/lib/customer/billing";
import { loadMessages } from "@/lib/message-attachments";
import DashboardShell from "@/components/dashboard/DashboardShell";
import SectionCard from "@/components/dashboard/SectionCard";
import SendMessageForm from "@/components/dashboard/SendMessageForm";
import MessageThreadList, { type MessageRow } from "@/components/dashboard/MessageThreadList";

export default async function CustomerMessagesPage() {
    const { profile, supabase, unreadCount } = await requireDashboardAccess("customer");

    const messagesData = await loadMessages((select) =>
        supabase
            .from("messages")
            .select(select)
            .or(`from_profile_id.eq.${profile.id},to_profile_id.eq.${profile.id}`)
            .order("created_at", { ascending: false })
            .limit(50)
    );

    const messages = (messagesData ?? []) as unknown as MessageRow[];

    // The employees coming to service this customer. Empty before the messaging SQL has been run.
    const { data: teamData, error: teamError } = await supabase.rpc("my_assigned_employees");
    const team = (teamData ?? []) as { id: string; full_name: string | null; next_date: string | null }[];

    return (
        <DashboardShell
            role="customer"
            profileId={profile.id}
            title="Messages"
            subtitle="Contact the Jigzack team."
            unreadCount={unreadCount}
        >
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

                    {teamError ? null : team.length === 0 ? (
                        <p className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white/50">
                            Once a pickup is assigned to someone, you can message them here.
                        </p>
                    ) : (
                        <SendMessageForm action={sendMessageToEmployee} label="Message the team coming to you">
                            <select
                                name="employeeId"
                                required
                                defaultValue=""
                                aria-label="Team member"
                                className="h-11 w-full rounded-xl border border-white/10 bg-[#141518] px-3 text-sm text-white outline-none"
                            >
                                <option value="" disabled>
                                    Who is coming to you?
                                </option>
                                {team.map((member) => (
                                    <option key={member.id} value={member.id}>
                                        {member.full_name ?? "Team member"}
                                        {member.next_date ? ` · next visit ${formatDate(member.next_date)}` : ""}
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
                                placeholder="Message, for example: the gate code, or where the bins are"
                                required
                                className="min-h-[90px] w-full rounded-xl border border-white/10 bg-white/8 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30"
                            />
                        </SendMessageForm>
                    )}
                </div>
            </SectionCard>
        </DashboardShell>
    );
}
