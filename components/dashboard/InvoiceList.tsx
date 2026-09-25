import Link from "next/link";
import { FileText, Receipt } from "lucide-react";
import StatusBadge from "@/components/dashboard/StatusBadge";
import { formatDate, invoiceNumber, naira, receiptNumber } from "@/lib/customer/billing";
import InvoiceTransferForm from "@/components/dashboard/InvoiceTransferForm";
import { amountPaid, balanceOf, invoiceTotal, type Installment } from "@/lib/billing/balance";

export type InvoiceRow = {
    id: string;
    amount: number | string | null;
    arrears: number | string | null;
    description: string | null;
    invoice_month: string | null;
    status: string | null;
    paid_at: string | null;
    payment_method: string | null;
    payment_reference: string | null;
    amount_paid?: number | string | null;
    created_at: string;
    // Set when the customer said they paid by transfer and it is not yet confirmed.
    transfer_reported_at?: string | null;
};

const STATUS_NOTE: Record<string, string> = {
    pending: "Awaiting payment. Pay by bank transfer using the details on the invoice.",
    failed: "This payment didn't go through. Contact support if you've already paid.",
};

export default function InvoiceList({
                                        invoices,
                                        canReport = false,
                                        installments = {},
                                    }: {
    invoices: InvoiceRow[];
    canReport?: boolean;
    // Payments received, by invoice id. Each one has its own receipt.
    installments?: Record<string, Installment[]>;
}) {
    if (invoices.length === 0) {
        return (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/60">
                No invoices yet.
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {invoices.map((invoice) => {
                const status = invoice.status ?? "pending";
                const total = invoiceTotal(invoice);
                const paid = amountPaid(invoice);
                const balance = balanceOf(invoice);
                const payments = installments[invoice.id] ?? [];
                const isPaid = status === "paid";
                const partPaid = !isPaid && paid > 0;
                const reported = !isPaid && Boolean(invoice.transfer_reported_at);

                return (
                    <div key={invoice.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:p-5">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div className="min-w-0">
                                <p className="font-bold">{invoice.invoice_month ?? formatDate(invoice.created_at)}</p>
                                <p className="mt-0.5 text-sm text-white/60">
                                    {invoice.description ?? "Waste management service charge"}
                                </p>
                                <p className="mt-1 text-xs text-white/35">
                                    {invoiceNumber(invoice.id)} · issued {formatDate(invoice.created_at)}
                                </p>
                            </div>

                            <div className="flex items-center gap-4 md:flex-col md:items-end md:gap-2">
                                <div className="text-right">
                                    <p className="text-lg font-bold text-amber-300">{naira(partPaid ? balance : total)}</p>
                                    {partPaid ? (
                                        <p className="text-xs text-white/40">
                                            still owed, {naira(paid)} of {naira(total)} paid
                                        </p>
                                    ) : (
                                        Number(invoice.arrears ?? 0) > 0 && (
                                            <p className="text-xs text-white/40">
                                                {naira(Number(invoice.amount ?? 0))} + {naira(Number(invoice.arrears ?? 0))} arrears
                                            </p>
                                        )
                                    )}
                                </div>
                                <StatusBadge status={partPaid ? "part_paid" : status} />
                            </div>
                        </div>

                        <div className="mt-3 flex flex-col gap-3 border-t border-white/10 pt-3 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-xs leading-5 text-white/45">
                                {isPaid
                                    ? `Paid ${formatDate(invoice.paid_at ?? invoice.created_at)}${
                                        invoice.payment_method ? ` via ${invoice.payment_method}` : ""
                                    }${invoice.payment_reference ? ` · ref ${invoice.payment_reference}` : ""}`
                                    : partPaid && !reported
                                        ? `${naira(paid)} received so far. ${naira(balance)} is still due.`
                                        : reported
                                        ? `You reported this payment on ${formatDate(invoice.transfer_reported_at)}. We will confirm it soon.`
                                        : STATUS_NOTE[status] ?? ""}
                            </p>

                            <div className="flex shrink-0 flex-wrap gap-2">
                                {canReport && status === "pending" && !reported && <InvoiceTransferForm paymentId={invoice.id} />}
                                <Link
                                    href={`/customer/invoices/${invoice.id}`}
                                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/10"
                                >
                                    <FileText className="h-3.5 w-3.5" />
                                    Invoice
                                </Link>
                                {payments.map((item, index) => (
                                    <Link
                                        key={item.id}
                                        href={`/customer/receipts/${item.id}`}
                                        title={`Receipt ${receiptNumber(item.id)}`}
                                        className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 px-3 py-2 text-xs font-bold text-black transition hover:bg-amber-300"
                                    >
                                        <Receipt className="h-3.5 w-3.5" />
                                        {payments.length > 1 ? `Receipt ${index + 1}` : "Receipt"}
                                    </Link>
                                ))}
                                {isPaid && payments.length === 0 && (
                                    <Link
                                        href={`/customer/receipts/${invoice.id}`}
                                        className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 px-3 py-2 text-xs font-bold text-black transition hover:bg-amber-300"
                                    >
                                        <Receipt className="h-3.5 w-3.5" />
                                        Receipt
                                    </Link>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
