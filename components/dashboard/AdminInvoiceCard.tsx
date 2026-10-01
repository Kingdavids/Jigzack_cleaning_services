import Link from "next/link";
import { updateInvoice } from "@/app/admin/actions";
import { formatDate, invoiceNumber, naira, receiptNumber } from "@/lib/customer/billing";
import { amountPaid, balanceOf, invoiceTotal, type Installment } from "@/lib/billing/balance";
import { normalizeLineItems } from "@/lib/billing/pricing";
import StatusBadge from "@/components/dashboard/StatusBadge";
import RecordPaymentControl from "@/components/dashboard/RecordPaymentControl";
import VoidPaymentButton from "@/components/dashboard/VoidPaymentButton";
import InvoiceEditor from "@/components/dashboard/InvoiceEditor";
import InvoiceTransferReview from "@/components/dashboard/InvoiceTransferReview";
import { BulkCheckbox } from "@/components/dashboard/BulkSelect";
import SendInvoiceButton from "@/components/dashboard/SendInvoiceButton";

export type AdminInvoiceRow = {
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
    customer?: { full_name: string | null } | null;
    // What the customer reported when they said they paid by transfer.
    transfer_reported_at?: string | null;
    transfer_note?: string | null;
    transfer_receipt_path?: string | null;
    // When the customer was last emailed this invoice.
    invoice_emailed_at?: string | null;
};

// One invoice as admins work with it: totals, payments received, a reported
// transfer to check, editing and recording a payment. The Payments page and a
// customer's own page both show this, so an invoice reads and edits the same
// in either place.
export default function AdminInvoiceCard({
                                             payment,
                                             installments,
                                             canAct,
                                             bulk = false,
                                             receiptUrl = null,
                                             showCustomer = true,
                                         }: {
    payment: AdminInvoiceRow;
    installments: Installment[];
    canAct: boolean;
    // Shows a select box for bulk actions; needs a BulkSelectProvider around it.
    bulk?: boolean;
    // A link to the transfer receipt the customer uploaded, if any.
    receiptUrl?: string | null;
    // Off on a customer's own page, where their name is already the heading.
    showCustomer?: boolean;
}) {
    const total = invoiceTotal(payment);
    const paid = amountPaid(payment);
    const balance = balanceOf(payment);
    const partPaid = payment.status !== "paid" && paid > 0;
    const month = payment.invoice_month ?? formatDate(payment.created_at);

    return (
        <div className={`relative rounded-3xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-white/20 ${bulk ? "pl-12" : ""}`}>
            {bulk && (
                <div className="absolute left-4 top-6">
                    <BulkCheckbox id={payment.id} label="Select invoice" />
                </div>
            )}
            <div className="flex items-center justify-between gap-4">
                <div>
                    <p className="font-bold">{showCustomer ? payment.customer?.full_name ?? "Unknown customer" : month}</p>
                    <p className="text-xs text-white/50">
                        {showCustomer ? `${month} · ` : ""}
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
                <Link href={`/admin/invoices/${payment.id}`} className="font-semibold text-amber-300 underline underline-offset-2">
                    Preview invoice
                </Link>
                {canAct && payment.status !== "paid" && (
                    <SendInvoiceButton
                        paymentId={payment.id}
                        customerName={payment.customer?.full_name ?? "The customer"}
                        month={month}
                        amountText={naira(balance)}
                        alreadySent={Boolean(payment.invoice_emailed_at)}
                    />
                )}
                {payment.invoice_emailed_at && (
                    <span className="text-white/45">Emailed {formatDate(payment.invoice_emailed_at)}</span>
                )}
                {payment.status === "paid" && installments.length === 0 && (
                    <Link href={`/admin/receipts/${payment.id}`} className="font-semibold text-amber-300 underline underline-offset-2">
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
                                <Link href={`/admin/receipts/${item.id}`} className="font-semibold text-amber-300 underline underline-offset-2">
                                    Preview receipt {receiptNumber(item.id)}
                                </Link>
                                {canAct && <VoidPaymentButton installmentId={item.id} label={`payment ${index + 1} (${naira(Number(item.amount))})`} />}
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
                            receiptUrl={receiptUrl}
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
}
