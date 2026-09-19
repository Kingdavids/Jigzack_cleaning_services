import { createClient } from "@/utils/supabase/server";
import { getUserProfile } from "@/lib/auth/getUserProfile";
import { redirect } from "next/navigation";
import Link from "next/link";

import DashboardShell from "@/components/dashboard/DashboardShell";
import SectionCard from "@/components/dashboard/SectionCard";
import StatCard from "@/components/dashboard/StatCard";
import StatusBadge from "@/components/dashboard/StatusBadge";
import SendMessageForm from "@/components/dashboard/SendMessageForm";
import MessageThreadList, { type MessageRow } from "@/components/dashboard/MessageThreadList";
import MarkMessagesReadOnView from "@/components/dashboard/MarkMessagesReadOnView";
import { deleteMessage, replyToMessage, sendMessageToAdmin } from "@/lib/messaging-actions";
import { CalendarClock, CalendarCheck, Camera, Wallet } from "lucide-react";

function formatDate(value: string | null | undefined) {
    if (!value) return "Not available";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString("en-CA", {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}

export default async function CustomerPage() {
    const profile = await getUserProfile();

    if (profile.status !== "approved") {
        redirect("/auth/pending");
    }

    if (profile.role !== "customer") {
        redirect(`/${profile.role}`);
    }

    const supabase = await createClient();

    const { data: customerData } = await supabase
        .from("customers")
        .select("*")
        .eq("profile_id", profile.id)
        .single();

    const customer = customerData ?? null;

    const { data: pickupsData, error: pickupsError } = await supabase
        .from("tasks")
        .select("*")
        .eq("customer_id", profile.id)
        .order("scheduled_date", { ascending: true });

    const { data: invoicesData, error: invoicesError } = await supabase
        .from("payments")
        .select("*")
        .eq("customer_id", profile.id)
        .order("created_at", { ascending: false });

    const { data: uploadsData, error: uploadsError } = await supabase
        .from("uploads")
        .select("*")
        .eq("customer_id", profile.id)
        .order("created_at", { ascending: false });

    const { data: messagesData } = await supabase
        .from("messages")
        .select(
            "id, subject, body, created_at, parent_message_id, from_profile_id, to_profile_id, read_at, from_profile:profiles!messages_from_profile_id_fkey(full_name), to_profile:profiles!messages_to_profile_id_fkey(full_name)"
        )
        .or(`from_profile_id.eq.${profile.id},to_profile_id.eq.${profile.id}`)
        .order("created_at", { ascending: false })
        .limit(50);

    if (pickupsError) console.error("Pickups error:", pickupsError.message);
    if (invoicesError) console.error("Invoices error:", invoicesError.message);
    if (uploadsError) console.error("Uploads error:", uploadsError.message);

    const pickups = pickupsData ?? [];
    const invoices = invoicesData ?? [];
    const uploads = uploadsData ?? [];
    const messages = (messagesData ?? []) as unknown as MessageRow[];

    const unreadCount = messages.filter((m) => m.to_profile_id === profile.id && !m.read_at).length;

    const now = new Date();

    const nextPickup =
        pickups.find((pickup) => {
            if (!pickup.scheduled_date) return false;
            return new Date(pickup.scheduled_date) >= now;
        }) ?? null;

    const outstandingBalance = invoices
        .filter((invoice) => (invoice.status ?? "").toLowerCase() !== "paid")
        .reduce((sum, invoice) => sum + Number(invoice.amount ?? 0), 0);

    return (
        <DashboardShell
            role="customer"
            title="Customer Dashboard"
            subtitle={`Welcome back, ${profile.full_name ?? customer?.full_name ?? "there"} — track service history, upcoming pickups, photos, and invoices.`}
            unreadCount={unreadCount}
        >
            <MarkMessagesReadOnView unreadCount={unreadCount} />
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                <StatCard
                    icon={CalendarCheck}
                    label="Last Serviced"
                    value={customer?.last_serviced ? formatDate(customer.last_serviced) : "Not available"}
                    helper="Most recent completed pickup"
                />
                <StatCard
                    icon={CalendarClock}
                    label="Next Pickup"
                    value={nextPickup?.scheduled_date ? formatDate(nextPickup.scheduled_date) : "Not scheduled"}
                    helper="Nearest upcoming service date"
                />
                <StatCard
                    icon={Camera}
                    label="Photos"
                    value={String(uploads.length)}
                    helper="Before and after service uploads"
                />
                <StatCard
                    icon={Wallet}
                    label="Outstanding Balance"
                    value={`₦${outstandingBalance.toLocaleString()}`}
                    helper="Current unpaid invoices"
                />
            </div>

            <div className="grid gap-6 2xl:grid-cols-2">
                <SectionCard id="tasks" title="Upcoming Pickup" description="Your next scheduled service">
                    {!nextPickup ? (
                        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/60">
                            No upcoming pickup scheduled.
                        </div>
                    ) : (
                        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <p className="font-bold text-lg">{nextPickup.title ?? "Scheduled Pickup"}</p>
                                    <p className="mt-2 text-sm text-white/60">
                                        {customer?.address ?? "No address available"}
                                    </p>
                                    <p className="mt-2 text-sm text-white/60">
                                        Scheduled: {formatDate(nextPickup.scheduled_date)}
                                    </p>
                                    <p className="mt-2 text-sm text-white/60">
                                        Zone: {nextPickup.zone ?? "Not assigned"}
                                    </p>
                                </div>
                                <StatusBadge status={nextPickup.status ?? "pending"} />
                            </div>
                        </div>
                    )}
                </SectionCard>

                <SectionCard title="Service Photos" description="Before and after task uploads">
                    {uploads.length === 0 ? (
                        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/60">
                            No service photos uploaded yet.
                        </div>
                    ) : (
                        <div className="grid gap-4 md:grid-cols-2">
                            {uploads.slice(0, 6).map((upload) => (
                                <div
                                    key={upload.id}
                                    className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] shadow"
                                >
                                    {upload.image_url ? (
                                        <img
                                            src={upload.image_url}
                                            alt={upload.photo_type ?? "Service photo"}
                                            className="h-44 w-full object-cover"
                                        />
                                    ) : (
                                        <div className="flex h-44 items-center justify-center bg-black/20 text-sm text-white/40">
                                            No image
                                        </div>
                                    )}

                                    <div className="p-4">
                                        <p className="font-bold capitalize">
                                            {upload.photo_type ?? "Service photo"}
                                        </p>
                                        <p className="text-sm text-white/60">
                                            {formatDate(upload.created_at)}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </SectionCard>
            </div>

            <SectionCard id="payments" title="Invoices" description="Download and review your billing records">
                {invoices.length === 0 ? (
                    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/60">
                        No invoices available.
                    </div>
                ) : (
                    <div className="space-y-4">
                        {invoices.map((invoice) => (
                            <div
                                key={invoice.id}
                                className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"
                            >
                                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                                    <div>
                                        <p className="font-bold">
                                            {invoice.invoice_month ?? invoice.date ?? "Invoice"}
                                        </p>
                                        <p className="text-sm text-white/60">
                                            Amount: ₦{Number(invoice.amount ?? 0).toLocaleString()}
                                        </p>
                                        <p className="text-sm text-white/60">
                                            Account: {customer?.account_code ?? "Not available"}
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-3">
                                        <StatusBadge status={invoice.status ?? "pending"} />
                                        <Link
                                            href={`/customer/invoices/${invoice.id}`}
                                            className="rounded-2xl bg-amber-400 px-4 py-2 font-semibold text-black transition hover:bg-amber-300"
                                        >
                                            View / Download
                                        </Link>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </SectionCard>

            <SectionCard id="messages" title="Messages" description="Contact the Jigzack team">
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