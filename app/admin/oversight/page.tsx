import Link from "next/link";
import { redirect } from "next/navigation";
import { requireDashboardAccess } from "@/lib/dashboard/requireDashboardAccess";
import { isOwner } from "@/lib/auth/roles";
import { formatDate, invoiceNumber, naira, receiptNumber } from "@/lib/customer/billing";
import { amountPaid, balanceOf, groupInstallments, invoiceTotal, loadInstallments } from "@/lib/billing/balance";
import DashboardShell from "@/components/dashboard/DashboardShell";
import SectionCard from "@/components/dashboard/SectionCard";
import StatusBadge from "@/components/dashboard/StatusBadge";
import StaffCustomerConversations from "@/components/dashboard/StaffCustomerConversations";

type InvoiceRow = {
    id: string;
    amount: number | string | null;
    arrears: number | string | null;
    amount_paid?: number | string | null;
    status: string | null;
    invoice_month: string | null;
    created_at: string;
    customer: { full_name: string | null } | null;
};

type ReceiptRow = {
    id: string;
    amount: number | string;
    balance_after: number | string;
    paid_at: string;
    method: string | null;
    payment: { invoice_month: string | null; customer: { full_name: string | null } | null } | null;
};

const linkClass = "font-semibold text-amber-300 underline underline-offset-2";

// Owners only. A read-only look at what is happening across the business:
// every conversation, every invoice and every receipt. Nothing here can be
// changed, so it is safe to browse.
export default async function OwnerOversightPage() {
    const { profile, supabase, unreadCount } = await requireDashboardAccess("admin");

    if (!isOwner(profile)) redirect("/admin");

    const columns =
        "id, subject, body, created_at, parent_message_id, from_profile_id, to_profile_id, is_broadcast, group_id, from_profile:profiles!messages_from_profile_id_fkey(full_name, role), to_profile:profiles!messages_to_profile_id_fkey(full_name, role)";
    const messageQuery = (select: string) =>
        supabase.from("messages").select(select).eq("is_broadcast", false).order("created_at", { ascending: false }).limit(500);

    let messagesResult = await messageQuery(`${columns}, attachment_path, attachment_name`);
    if (messagesResult.error) messagesResult = await messageQuery(columns);

    const [{ data: invoiceData }, receiptResult] = await Promise.all([
        supabase
            .from("payments")
            .select("*, customer:profiles!payments_customer_id_fkey(full_name)")
            .order("created_at", { ascending: false })
            .limit(60),
        supabase
            .from("payment_installments")
            .select("id, amount, balance_after, paid_at, method, payment:payments(invoice_month, customer:profiles!payments_customer_id_fkey(full_name))")
            .order("paid_at", { ascending: false })
            .limit(60),
    ]);

    const invoices = (invoiceData ?? []) as unknown as InvoiceRow[];
    const receipts = (receiptResult.error ? [] : (receiptResult.data ?? [])) as unknown as ReceiptRow[];

    // Invoices settled in one go before part payments existed have a single receipt of their own.
    const withPayments = groupInstallments(await loadInstallments(supabase, invoices.map((i) => i.id)));
    const legacyReceipts = invoices.filter((i) => i.status === "paid" && !withPayments.has(i.id));

    return (
        <DashboardShell
            role="admin"
            profileId={profile.id}
            title="Oversight"
            subtitle="A read-only view of every conversation, invoice and receipt. Nothing here can be changed."
            unreadCount={unreadCount}
        >
            <div className="space-y-6">
                <SectionCard
                    title="Conversations"
                    description="Every thread between customers, staff and admins. Reading them changes nothing for the people in them, and nobody is notified."
                >
                    <StaffCustomerConversations
                        scope="everyone"
                        messages={(messagesResult.data ?? []) as unknown as Parameters<typeof StaffCustomerConversations>[0]["messages"]}
                    />
                </SectionCard>

                <SectionCard title="Invoices" description="The 60 most recent. Open one to see exactly what the customer sees.">
                    {invoices.length === 0 ? (
                        <p className="text-sm text-white/50">No invoices yet.</p>
                    ) : (
                        <div className="space-y-2">
                            {invoices.map((invoice) => {
                                const partPaid = invoice.status !== "paid" && amountPaid(invoice) > 0;

                                return (
                                    <div
                                        key={invoice.id}
                                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm"
                                    >
                                        <div className="min-w-0">
                                            <p className="font-semibold">{invoice.customer?.full_name ?? "Unknown customer"}</p>
                                            <p className="text-xs text-white/50">
                                                {invoice.invoice_month ?? formatDate(invoice.created_at)} · {invoiceNumber(invoice.id)}
                                            </p>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-4">
                                            <span className="text-right">
                                                <span className="block font-bold text-amber-300">{naira(invoiceTotal(invoice))}</span>
                                                {partPaid && (
                                                    <span className="block text-xs text-white/50">{naira(balanceOf(invoice))} still owed</span>
                                                )}
                                            </span>
                                            <StatusBadge status={partPaid ? "part_paid" : invoice.status ?? "pending"} />
                                            <Link href={`/admin/invoices/${invoice.id}`} className={linkClass}>
                                                View
                                            </Link>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </SectionCard>

                <SectionCard title="Receipts" description="One for every payment received, most recent first.">
                    {receipts.length === 0 && legacyReceipts.length === 0 ? (
                        <p className="text-sm text-white/50">No receipts yet.</p>
                    ) : (
                        <div className="space-y-2">
                            {receipts.map((receipt) => (
                                <div
                                    key={receipt.id}
                                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm"
                                >
                                    <div className="min-w-0">
                                        <p className="font-semibold">{receipt.payment?.customer?.full_name ?? "Unknown customer"}</p>
                                        <p className="text-xs text-white/50">
                                            {receipt.payment?.invoice_month ?? "Invoice"} · {receiptNumber(receipt.id)} · {formatDate(receipt.paid_at)}
                                            {receipt.method ? ` · ${receipt.method}` : ""}
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-4">
                                        <span className="text-right">
                                            <span className="block font-bold text-emerald-300">{naira(Number(receipt.amount))}</span>
                                            <span className="block text-xs text-white/50">{naira(Number(receipt.balance_after))} owed after</span>
                                        </span>
                                        <Link href={`/admin/receipts/${receipt.id}`} className={linkClass}>
                                            View
                                        </Link>
                                    </div>
                                </div>
                            ))}
                            {legacyReceipts.map((invoice) => (
                                <div
                                    key={invoice.id}
                                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm"
                                >
                                    <div className="min-w-0">
                                        <p className="font-semibold">{invoice.customer?.full_name ?? "Unknown customer"}</p>
                                        <p className="text-xs text-white/50">
                                            {invoice.invoice_month ?? formatDate(invoice.created_at)} · {receiptNumber(invoice.id)}
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-4">
                                        <span className="font-bold text-emerald-300">{naira(invoiceTotal(invoice))}</span>
                                        <Link href={`/admin/receipts/${invoice.id}`} className={linkClass}>
                                            View
                                        </Link>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </SectionCard>
            </div>
        </DashboardShell>
    );
}
