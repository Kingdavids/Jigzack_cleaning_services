import { requireDashboardAccess } from "@/lib/dashboard/requireDashboardAccess";
import { createInvoice, generateAllInvoices, updateInvoice } from "../actions";
import { formatDate, invoiceNumber, naira, receiptNumber } from "@/lib/customer/billing";
import { amountPaid, balanceOf, groupInstallments, invoiceTotal, loadInstallmentsChunked } from "@/lib/billing/balance";
import { monthLabel, normalizeLineItems } from "@/lib/billing/pricing";
import DashboardShell from "@/components/dashboard/DashboardShell";
import SectionCard from "@/components/dashboard/SectionCard";
import StatusBadge from "@/components/dashboard/StatusBadge";
import CreateInvoiceForm from "@/components/dashboard/CreateInvoiceForm";
import RecordPaymentControl from "@/components/dashboard/RecordPaymentControl";
import VoidPaymentButton from "@/components/dashboard/VoidPaymentButton";
import InvoiceEditor from "@/components/dashboard/InvoiceEditor";
import BillingActionButton from "@/components/dashboard/BillingActionButton";
import InvoiceTransferReview from "@/components/dashboard/InvoiceTransferReview";
import Link from "next/link";
import { PAYMENT_RECEIPT_BUCKET } from "@/lib/bank-details";
import { deletedProfileIds } from "@/lib/admin/deletedCustomers";
import { BulkCheckbox, BulkSelectProvider } from "@/components/dashboard/BulkSelect";
import { deleteInvoices } from "../cleanup-actions";
import { isFullAdmin, isOwner } from "@/lib/auth/roles";
import RegistrationFeeControls from "@/components/dashboard/RegistrationFeeControls";
import { CustomerGroup, GroupFilter } from "@/components/dashboard/CustomerGroups";

type ProfileRef = { full_name: string | null } | null;

const PAID_LIMIT = 300;

type PaymentRow = {
    id: string;
    customer_id?: string | null;
    amount: number;
    arrears: number | null;
    status: string;
    description: string | null;
    invoice_month: string | null;
    created_at: string;
    paid_at: string | null;
    payment_method: string | null;
    payment_reference: string | null;
    amount_paid?: number | string | null;
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

    // "*" picks up the transfer and part payment columns once they exist, so the
    // page works before and after the SQL files have been run. Unpaid and paid are
    // loaded separately, so a long history of paid invoices can never push unpaid
    // ones off the list.
    const withCustomer = "*, customer:profiles!payments_customer_id_fkey(full_name)";
    const [unpaidResult, paidResult] = await Promise.all([
        supabase.from("payments").select(withCustomer).neq("status", "paid").order("created_at", { ascending: true }).limit(500),
        supabase.from("payments").select(withCustomer).eq("status", "paid").order("paid_at", { ascending: false, nullsFirst: false }).limit(PAID_LIMIT),
    ]);

    const unpaidList = (unpaidResult.data ?? []) as unknown as PaymentRow[];
    const paidList = (paidResult.data ?? []) as unknown as PaymentRow[];
    const payments = [...unpaidList, ...paidList];
    const canBulk = isOwner(profile);
    const canAct = isFullAdmin(profile);
    const installmentsByInvoice = groupInstallments(await loadInstallmentsChunked(supabase, payments.map((p) => p.id)));

    // Group by customer. Unpaid: customers who reported a payment first, then the largest balance.
    type InvoiceGroup = { key: string; name: string; items: PaymentRow[]; owed: number; total: number; reported: number };
    const groupBy = (list: PaymentRow[]) => {
        const map = new Map<string, InvoiceGroup>();

        for (const invoice of list) {
            const name = invoice.customer?.full_name ?? "Unknown customer";
            const key = invoice.customer_id ?? name;
            const group = map.get(key) ?? { key, name, items: [], owed: 0, total: 0, reported: 0 };

            group.items.push(invoice);
            group.owed += balanceOf(invoice);
            group.total += invoiceTotal(invoice);
            if (invoice.transfer_reported_at) group.reported += 1;
            map.set(key, group);
        }

        return [...map.values()];
    };

    const unpaidGroups = groupBy(unpaidList).sort(
        (a, b) => Number(b.reported > 0) - Number(a.reported > 0) || b.owed - a.owed || a.name.localeCompare(b.name)
    );
    const paidGroups = groupBy(paidList).sort((a, b) => a.name.localeCompare(b.name));
    const paidTotal = paidList.reduce((sum, invoice) => sum + invoiceTotal(invoice), 0);

    // One-off registration fees still to be settled: approved customers who are
    // not tenants (tenants are waived) and have not been marked as paid.
    const { data: feeData } = await supabase
        .from("customers")
        .select("*")
        .in("profile_id", customerOptions.map((c) => c.id))
        .is("unit_id", null)
        .eq("registration_fee_paid", false);

    type FeeRow = {
        profile_id: string;
        full_name: string | null;
        phone: string | null;
        registration_fee_submitted_at?: string | null;
        registration_fee_note?: string | null;
        registration_fee_receipt_path?: string | null;
    };

    const feeRows = ((feeData ?? []) as unknown as FeeRow[]).sort((a, b) => {
        const aReported = a.registration_fee_submitted_at ? 0 : 1;
        const bReported = b.registration_fee_submitted_at ? 0 : 1;
        return aReported - bReported || (a.full_name ?? "").localeCompare(b.full_name ?? "");
    });
    const feeReported = feeRows.filter((f) => f.registration_fee_submitted_at);
    const feeOwing = feeRows.filter((f) => !f.registration_fee_submitted_at);

    // Receipts are private, so each one opens through a link that expires in an hour.
    const receiptPaths = [
        // Only unpaid invoices can have a reported transfer waiting to be checked.
        ...unpaidList.map((p) => p.transfer_receipt_path),
        ...feeRows.map((f) => f.registration_fee_receipt_path),
    ].filter((p): p is string => Boolean(p));
    const signed = receiptPaths.length
        ? (await supabase.storage.from(PAYMENT_RECEIPT_BUCKET).createSignedUrls(receiptPaths, 3600)).data ?? []
        : [];
    const receiptUrl = new Map(signed.map((s) => [s.path, s.signedUrl]));

    const renderInvoice = (payment: PaymentRow) => {
                                const total = invoiceTotal(payment);
                                const paid = amountPaid(payment);
                                const balance = balanceOf(payment);
                                const partPaid = payment.status !== "paid" && paid > 0;
                                const installments = installmentsByInvoice.get(payment.id) ?? [];

                                return (
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
                                                <p className="font-bold text-amber-300">{naira(total)}</p>
                                                {partPaid && (
                                                    <p className="text-xs text-white/50">
                                                        {naira(paid)} paid, {naira(balance)} owed
                                                    </p>
                                                )}
                                                <StatusBadge status={partPaid ? "part_paid" : payment.status} />
                                            </div>
                                        </div>

                                        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/10 pt-3 text-xs">
                                            <Link
                                                href={`/admin/invoices/${payment.id}`}
                                                className="font-semibold text-amber-300 underline underline-offset-2"
                                            >
                                                Preview invoice
                                            </Link>
                                            {payment.status === "paid" && installments.length === 0 && (
                                                <Link
                                                    href={`/admin/receipts/${payment.id}`}
                                                    className="font-semibold text-amber-300 underline underline-offset-2"
                                                >
                                                    Preview receipt
                                                </Link>
                                            )}
                                            {payment.status === "paid" && installments.length === 0 && (
                                                <span className="text-white/45">
                                                    Paid {formatDate(payment.paid_at ?? payment.created_at)}
                                                    {payment.payment_method ? ` via ${payment.payment_method}` : ""}
                                                </span>
                                            )}
                                        </div>

                                        {installments.length > 0 && (
                                            <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
                                                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-white/45">Payments received</p>
                                                <ul className="mt-2 space-y-2">
                                                    {installments.map((item, index) => (
                                                        <li key={item.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                                                            <span className="font-semibold text-white">{naira(Number(item.amount))}</span>
                                                            <span className="text-white/55">
                                                                {formatDate(item.paid_at)}
                                                                {item.method ? ` · ${item.method}` : ""}
                                                                {item.reference ? ` · ref ${item.reference}` : ""}
                                                            </span>
                                                            <span className="text-white/45">{naira(Number(item.balance_after))} owed after</span>
                                                            <Link
                                                                href={`/admin/receipts/${item.id}`}
                                                                className="font-semibold text-amber-300 underline underline-offset-2"
                                                            >
                                                                Preview receipt {receiptNumber(item.id)}
                                                            </Link>
                                                            {canAct && (
                                                                <VoidPaymentButton
                                                                    installmentId={item.id}
                                                                    label={`payment ${index + 1} (${naira(Number(item.amount))})`}
                                                                />
                                                            )}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}

                                        {payment.status !== "paid" && (
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
                                                {canAct && <RecordPaymentControl key={`${payment.id}-${balance}`} paymentId={payment.id} balance={balance} />}
                                            </>
                                        )}
                                    </div>
                                );
    };

    return (
        <DashboardShell
            role="admin"
            profileId={profile.id}
            title="Payments"
            subtitle="Invoices are generated from each customer's property details. Edit any of them before or after sending."
            unreadCount={unreadCount}
        >
            <div className="space-y-6">
                <div id="registration-fees" className="scroll-mt-24">
                    <SectionCard
                        title="Registration fees"
                        description="The one-off fee new customers pay by bank transfer. Confirm each one when the money arrives. Tenants and existing customers are not charged."
                    >
                        {feeRows.length === 0 ? (
                            <p className="text-sm text-white/55">No registration fees are waiting.</p>
                        ) : (
                            <div className="space-y-4">
                                {feeReported.length > 0 && (
                                    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-amber-300">
                                        Waiting for you to confirm ({feeReported.length})
                                    </p>
                                )}
                                {feeReported.map((fee) => (
                                    <div key={fee.profile_id} className="rounded-2xl border border-amber-300/25 bg-white/[0.03] p-4">
                                        <p className="font-bold">{fee.full_name ?? "Unknown customer"}</p>
                                        {canAct ? (
                                            <div className="mt-3">
                                                <RegistrationFeeControls
                                                    profileId={fee.profile_id}
                                                    paid={false}
                                                    reported
                                                    receiptUrl={fee.registration_fee_receipt_path ? receiptUrl.get(fee.registration_fee_receipt_path) ?? null : null}
                                                    reportedNote={fee.registration_fee_note ?? null}
                                                    reportedAt={fee.registration_fee_submitted_at ? formatDate(fee.registration_fee_submitted_at) : null}
                                                    paidText=""
                                                />
                                            </div>
                                        ) : (
                                            <p className="mt-1 text-sm text-white/60">Reported as paid, waiting for an admin to confirm.</p>
                                        )}
                                    </div>
                                ))}

                                {feeOwing.length > 0 && (
                                    <details className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                                        <summary className="cursor-pointer text-sm font-semibold text-white/80">
                                            Not paid yet ({feeOwing.length})
                                        </summary>
                                        <div className="mt-4 space-y-4">
                                            {feeOwing.map((fee) => (
                                                <div key={fee.profile_id} className="rounded-xl border border-white/10 p-4">
                                                    <p className="font-bold">{fee.full_name ?? "Unknown customer"}</p>
                                                    {canAct ? (
                                                        <div className="mt-3">
                                                            <RegistrationFeeControls
                                                                profileId={fee.profile_id}
                                                                paid={false}
                                                                reported={false}
                                                                receiptUrl={null}
                                                                reportedNote={null}
                                                                reportedAt={null}
                                                                paidText=""
                                                            />
                                                        </div>
                                                    ) : (
                                                        <p className="mt-1 text-sm text-white/60">Not paid yet.</p>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </details>
                                )}
                            </div>
                        )}
                    </SectionCard>
                </div>

                <SectionCard
                    title="Monthly invoices"
                    description={`Creates a ${monthLabel()} invoice for every active customer that doesn't have one yet: flat ₦5,000, mini flat ₦5,000, shop ₦2,000, duplex ₦8,000, bungalow ₦7,000, terrace ₦10,000, minus any vacant units.`}
                >
                    <BillingActionButton run={generateAllInvoices}>Generate {monthLabel()} invoices</BillingActionButton>
                </SectionCard>

                <BulkSelectProvider
                    enabled={canBulk && payments.length > 0}
                    allIds={payments.map((p) => p.id)}
                    paidIds={paidList.map((p) => p.id)}
                    action={deleteInvoices}
                    noun="invoice"
                >
                    <SectionCard
                        title="Needs attention"
                        description="Invoices not fully paid, grouped by customer. Customers who say they have paid come first, then whoever owes the most."
                    >
                        {unpaidGroups.length === 0 ? (
                            <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/60">
                                Nothing is waiting for payment.
                            </p>
                        ) : (
                            <GroupFilter onlyLabel="Only customers who reported a payment">
                                {unpaidGroups.map((group) => (
                                    <CustomerGroup
                                        key={group.key}
                                        name={group.name}
                                        needs={group.reported}
                                        defaultOpen={group.reported > 0 || unpaidGroups.length <= 6}
                                        header={
                                            <div>
                                                <p className="truncate text-lg font-bold">{group.name}</p>
                                                <p className="mt-0.5 text-sm text-white/55">
                                                    {group.items.length} unpaid invoice{group.items.length === 1 ? "" : "s"} ·{" "}
                                                    <span className="font-semibold text-amber-300">{naira(group.owed)} owed</span>
                                                    {group.reported > 0 && (
                                                        <span className="ml-2 rounded-full bg-sky-400/15 px-2 py-0.5 text-[11px] font-bold text-sky-300">
                                                            payment reported
                                                        </span>
                                                    )}
                                                </p>
                                            </div>
                                        }
                                    >
                                        {group.items.map(renderInvoice)}
                                    </CustomerGroup>
                                ))}
                            </GroupFilter>
                        )}
                    </SectionCard>

                    <div className="mt-6">
                        <SectionCard
                            title="Paid"
                            collapsible
                            badge={
                                <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-300">
                                    {paidList.length} invoice{paidList.length === 1 ? "" : "s"} · {naira(paidTotal)}
                                </span>
                            }
                            description={
                                paidList.length >= PAID_LIMIT
                                    ? `The latest ${PAID_LIMIT} paid invoices, grouped by customer. Search to find one.`
                                    : "Invoices that are settled, grouped by customer. Open one to see its receipts."
                            }
                        >
                            {paidGroups.length === 0 ? (
                                <p className="text-sm text-white/55">No paid invoices yet.</p>
                            ) : (
                                <GroupFilter>
                                    {paidGroups.map((group) => (
                                        <CustomerGroup
                                            key={group.key}
                                            name={group.name}
                                            defaultOpen={false}
                                            header={
                                                <div>
                                                    <p className="truncate text-lg font-bold">{group.name}</p>
                                                    <p className="mt-0.5 text-sm text-white/55">
                                                        {group.items.length} paid invoice{group.items.length === 1 ? "" : "s"} ·{" "}
                                                        <span className="font-semibold text-emerald-300">{naira(group.total)}</span>
                                                    </p>
                                                </div>
                                            }
                                        >
                                            {group.items.map(renderInvoice)}
                                        </CustomerGroup>
                                    ))}
                                </GroupFilter>
                            )}
                        </SectionCard>
                    </div>
                </BulkSelectProvider>

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
