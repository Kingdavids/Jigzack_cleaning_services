import { requireDashboardAccess } from "@/lib/dashboard/requireDashboardAccess";
import { deleteMessage, replyToMessage, sendMessageToAdmin, sendMessageToCustomer } from "@/lib/messaging-actions";
import { loadMessages } from "@/lib/message-attachments";
import DashboardShell from "@/components/dashboard/DashboardShell";
import SectionCard from "@/components/dashboard/SectionCard";
import SendMessageForm from "@/components/dashboard/SendMessageForm";
import MessageThreadList, { type MessageRow } from "@/components/dashboard/MessageThreadList";

export default async function EmployeeMessagesPage() {
    const { profile, supabase, unreadCount } = await requireDashboardAccess("employee");

    const messagesData = await loadMessages((select) =>
        supabase
            .from("messages")
            .select(select)
            .or(`from_profile_id.eq.${profile.id},to_profile_id.eq.${profile.id}`)
            .order("created_at", { ascending: false })
            .limit(50)
    );

    const messages = (messagesData ?? []) as unknown as MessageRow[];

    // The customers this person has a job for. Before the database update has
    // been run this call fails, and the form simply explains that.
    const { data: contactData, error: contactsError } = await supabase.rpc("my_customer_contacts");
    const contacts = (contactData ?? []) as { id: string; full_name: string | null }[];

    return (
        <DashboardShell
            role="employee"
            profileId={profile.id}
            title="Messages"
            subtitle="Message the admin or the customers you serve."
            unreadCount={unreadCount}
        >
            <SectionCard title="Messages" description="Message the admin or a customer you have a job for">
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

                    {contactsError ? null : contacts.length === 0 ? (
                        <p className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white/50">
                            You can message a customer once you have a job assigned for them.
                        </p>
                    ) : (
                        <SendMessageForm action={sendMessageToCustomer} label="Send a message to a customer">
                            <select
                                name="customerId"
                                required
                                defaultValue=""
                                aria-label="Customer"
                                className="h-11 w-full rounded-xl border border-white/10 bg-[#141518] px-3 text-sm text-white outline-none"
                            >
                                <option value="" disabled>
                                    Select customer
                                </option>
                                {contacts.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.full_name}
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
                    )}
                </div>
            </SectionCard>
        </DashboardShell>
    );
}
