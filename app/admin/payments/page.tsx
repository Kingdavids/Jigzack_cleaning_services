import { requireDashboardAccess } from "@/lib/dashboard/requireDashboardAccess";
import { createInvoice, generateAllInvoices, updateInvoice } from "../actions";
import { formatDate, invoiceNumber, naira } from "@/lib/customer/billing";
import { monthLabel, normalizeLineItems } from "@/lib/billing/pricing";
import DashboardShell from "@/components/dashboard/DashboardShell";
import SectionCard from "@/components/dashboard/SectionCard";
import StatusBadge from "@/components/dashboard/StatusBadge";
import CreateInvoiceForm from "@/components/dashboard/CreateInvoiceForm";
import MarkPaidControl from "@/components/dashboard/MarkPaidControl";
import InvoiceEditor from "@/components/dashboard/InvoiceEditor";
import BillingActionButton from "@/components/dashboard/BillingActionButton";
import InvoiceTransferReview from "@/components/dashboard/InvoiceTransferReview";
import { PAYMENT_RECEIPT_BUCKET } from "@/lib/bank-details";
import { deletedProfileIds } from "@/lib/admin/deletedCustomers";
import { BulkCheckbox, BulkSelectProvider } from "@/components/dashboard/BulkSelect";
import { deleteInvoices } from "../cleanup-actions";
import { isOwner } from "@/lib/auth/roles";

type ProfileRef = { full_name: string | null } | null;

type PaymentRow = {
    id: string;
    amount: number;
    arrears: number | null;
    status: string;
    description: string | null;
    invoice_month: string | null;
    created_at: string;
    paid_at: string | null;
    payment_method: string | null;
    line_items: unknown;
    auto_generated: boolean;
    customer: ProfileRef;
    // What the customer reported when they said they paid by transfer.
    transfer_reported_at?: string | null;
    transfer_note?: string | null;
    transfer_receipt_path?: string | null;
};

export default async function AdminPaymentsPage() {
    const { profile, supabase, unreadCount } = await requireDashboardAccess("admin");

    const { data: directoryData } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .eq("role", "customer")
        .eq("status", "approved")
        .order("full_name", { ascending: true });

    const hidden = await deletedProfileIds(supabase);
    const customerOptions = (directoryData ?? []).filter((c) => !hidden.has(c.id));

    // The transfer_* columns arrive with supabase/manual-payments-2026-09.sql;
    // until then load the invoices without them so the page never breaks.
    const baseColumns =
        "id, amount, arrears, status, description, invoice_month, created_at, paid_at, payment_method, line_items, auto_generated, customer:profiles!payments_customer_id_fkey(full_name)";

    let paymentsResult = await supabase
        .from("payments")
        .select(`${baseColumns}, transfer_reported_at, transfer_note, transfer_receipt_path`)
        .order("created_at", { ascending: false })
        .limit(40);

    if (paymentsResult.error) {
        paymentsResult = (await supabase
            .from("payments")
            .select(baseColumns)
            .order("created_at", { ascending: false })
            .limit(40)) as unknown as typeof paymentsResult;
    }

    const payments = (paymentsResult.data ?? []) as unknown as PaymentRow[];
    const canBulk = isOwner(profile);

    // Receipts are private, so each one opens through a link that expires in an hour.
    const receiptPaths = payments.map((p) => p.transfer_receipt_path).filter((p): p is string => Boolean(p));
    const signed = receiptPaths.length
        ? (await supabase.storage.from(PAYMENT_RECEIPT_BUCKET).createSignedUrls(receiptPaths, 3600)).data ?? []
        : [];
    const receiptUrl = new Map(signed.map((s) => [s.path, s.signedUrl]));

    return (
        <DashboardShell
            role="admin"
            profileId={profile.id}
            title="Payments"
            subtitle="Invoices are generated from each customer's property details. Edit any of them before or after sending."
            unreadCount={unreadCount}
        >
            <div className="space-y-6">
                <SectionCard
                    title="Monthly invoices"
                    description={`Creates a ${monthLabel()} invoice for every active customer that doesn't have one yet: flat ₦5,000, mini flat ₦5,000, shop ₦2,000, duplex ₦8,000, bungalow ₦7,000, terrace ₦10,000, minus any vacant units.`}
                >
                    <BillingActionButton run={generateAllInvoices}>Generate {monthLabel()} invoices</BillingActionButton>
                </SectionCard>

                <SectionCard title="Invoices" description="Most recent first.">
                    <BulkSelectProvider
                        enabled={canBulk && payments.length > 0}
                        allIds={payments.map((p) => p.id)}
                        paidIds={payments.filter((p) => p.status === "paid").map((p) => p.id)}
                        action={deleteInvoices}
                        noun="invoice"
                    >
                    <div className="space-y-4">
                        {payments.length === 0 ? (
                            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/60">
                                No invoices yet.
                            </div>
                        ) : (
                            payments.map((payment) => (
                                <div
                                    key={payment.id}
                                    className={`relative rounded-3xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-white/20 ${canBulk ? "pl-12" : ""}`}
                                >
                                    <div className="absolute left-4 top-6">
                                        <BulkCheckbox id={payment.id} label="Select invoice" />
                                    </div>
                                    <div className="flex items-center justify-between gap-4">
                                        <div>
                                            <p className="font-bold">{payment.customer?.full_name ?? "Unknown customer"}</p>
                                            <p className="text-xs text-white/50">
                                                {payment.invoice_month ?? formatDate(payment.created_at)} ·{" "}
                                                {invoiceNumber(payment.id)}
                                                {payment.auto_generated ? " · auto-generated" : ""}
                                            </p>
                                        </div>

                                        <div className="text-right">
                                            <p className="font-bold text-amber-300">
                                                {naira(Number(payment.amount) + Number(payment.arrears ?? 0))}
                                            </p>
                                            <StatusBadge status={payment.status} />
                                        </div>
                                    </div>

                                    {payment.status === "paid" ? (
                                        <p className="mt-3 border-t border-white/10 pt-3 text-xs text-white/45">
                                            Paid {formatDate(payment.paid_at ?? payment.created_at)}
                                            {payment.payment_method ? ` via ${payment.payment_method}` : ""}
                                        </p>
                                    ) : (
                                        <>
                                            {payment.transfer_reported_at && (
                                                <InvoiceTransferReview
                                                    paymentId={payment.id}
                                                    reportedAt={formatDate(payment.transfer_reported_at)}
                                                    note={payment.transfer_note ?? null}
                                                    receiptUrl={payment.transfer_receipt_path ? receiptUrl.get(payment.transfer_receipt_path) ?? null : null}
                                                />
                                            )}
                                            <InvoiceEditor
                                                action={updateInvoice}
                                                invoice={{
                                                    id: payment.id,
                                                    invoice_month: payment.invoice_month,
                                                    description: payment.description,
                                                    arrears: Number(payment.arrears ?? 0),
                                                    amount: Number(payment.amount),
                                                    line_items: normalizeLineItems(payment.line_items),
                                                    auto_generated: payment.auto_generated,
                                                }}
                                            />
                                            <MarkPaidControl paymentId={payment.id} />
                                        </>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                    </BulkSelectProvider>
                </SectionCard>

                <SectionCard title="Create a one-off invoice" description="For anything outside the monthly charge.">
                    <CreateInvoiceForm action={createInvoice}>
                        <select
                            name="customerId"
                            required
                            defaultValue=""
                            className="h-11 w-full rounded-xl border border-white/10 bg-[#141518] px-3 text-sm text-white outline-none"
                        >
                            <option value="" disabled>
                                Select customer
                            </option>
                            {customerOptions.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.full_name}
                                </option>
                            ))}
                        </select>

                        <div className="grid gap-3 sm:grid-cols-2">
                            <input
                                type="number"
                                name="amount"
                                placeholder="Amount (₦)"
                                required
                                min="0"
                                step="0.01"
                                className="h-11 w-full rounded-xl border border-white/10 bg-white/8 px-3 text-sm text-white outline-none placeholder:text-white/30"
                            />
                            <input
                                name="invoiceMonth"
                                placeholder="e.g. March 2026"
                                className="h-11 w-full rounded-xl border border-white/10 bg-white/8 px-3 text-sm text-white outline-none placeholder:text-white/30"
                            />
                        </div>

                        <input
                            name="description"
                            placeholder="Description"
                            className="h-11 w-full rounded-xl border border-white/10 bg-white/8 px-3 text-sm text-white outline-none placeholder:text-white/30"
                        />
                    </CreateInvoiceForm>
                </SectionCard>
            </div>
        </DashboardShell>
    );
}
