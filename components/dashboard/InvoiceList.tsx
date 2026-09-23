import Link from "next/link";
import { FileText, Receipt } from "lucide-react";
import StatusBadge from "@/components/dashboard/StatusBadge";
import { formatDate, invoiceNumber, naira } from "@/lib/customer/billing";

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
    created_at: string;
};

const STATUS_NOTE: Record<string, string> = {
    pending: "Awaiting payment. Pay by bank transfer using the details on the invoice.",
    failed: "This payment didn't go through. Contact support if you've already paid.",
};

export default function InvoiceList({ invoices }: { invoices: InvoiceRow[] }) {
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
                const amount = Number(invoice.amount ?? 0);
                const arrears = Number(invoice.arrears ?? 0);
                const isPaid = status === "paid";

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
                                    <p className="text-lg font-bold text-amber-300">{naira(amount + arrears)}</p>
                                    {arrears > 0 && (
                                        <p className="text-xs text-white/40">
                                            {naira(amount)} + {naira(arrears)} arrears
                                        </p>
                                    )}
                                </div>
                                <StatusBadge status={status} />
                            </div>
                        </div>

                        <div className="mt-3 flex flex-col gap-3 border-t border-white/10 pt-3 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-xs leading-5 text-white/45">
                                {isPaid
                                    ? `Paid ${formatDate(invoice.paid_at ?? invoice.created_at)}${
                                        invoice.payment_method ? ` via ${invoice.payment_method}` : ""
                                    }${invoice.payment_reference ? ` · ref ${invoice.payment_reference}` : ""}`
                                    : STATUS_NOTE[status] ?? ""}
                            </p>

                            <div className="flex shrink-0 gap-2">
                                <Link
                                    href={`/customer/invoices/${invoice.id}`}
                                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/10"
                                >
                                    <FileText className="h-3.5 w-3.5" />
                                    Invoice
                                </Link>
                                {isPaid && (
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
