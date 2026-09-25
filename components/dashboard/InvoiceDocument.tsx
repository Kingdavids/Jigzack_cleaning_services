import Link from "next/link";
import { formatDate, invoiceNumber, naira, receiptNumber } from "@/lib/customer/billing";
import { normalizeLineItems, type LineItem } from "@/lib/billing/pricing";
import { amountPaid, balanceOf, invoiceTotal, type Installment } from "@/lib/billing/balance";
import DocumentActions from "@/components/dashboard/DocumentActions";
import { DocumentHeader, PaymentDetailsBlock, PropertyDetailsBlock, SupportBlock } from "@/components/dashboard/DocumentParts";

type PropertyProps = Parameters<typeof PropertyDetailsBlock>[0]["customer"];

type InvoiceRecord = {
    id: string;
    amount: number | string | null;
    arrears?: number | string | null;
    units?: number | string | null;
    status?: string | null;
    amount_paid?: number | string | null;
    description?: string | null;
    invoice_month?: string | null;
    line_items?: unknown;
    created_at: string;
};

// One invoice, laid out the way the customer sees it. The customer's own page
// and the admin's preview both render this, so they can never drift apart.
export default function InvoiceDocument({
                                            invoice,
                                            customer,
                                            fallbackName,
                                            installments,
                                            basePath,
                                            previewFor,
                                        }: {
    invoice: InvoiceRecord;
    customer: PropertyProps;
    fallbackName?: string | null;
    installments: Installment[];
    basePath: "/customer" | "/admin";
    // Set on the admin side: who the customer is, shown in a "preview" strip.
    previewFor?: string | null;
}) {
    const amount = Number(invoice.amount ?? 0);
    const arrears = Number(invoice.arrears ?? 0);
    const total = invoiceTotal(invoice);
    const paid = amountPaid(invoice);
    const balance = balanceOf(invoice);
    const status = invoice.status ?? "pending";
    const partPaid = status !== "paid" && paid > 0;
    const statusLabel = status === "paid" ? "paid" : partPaid ? "part paid" : status;
    const number = invoiceNumber(invoice.id);
    const month = invoice.invoice_month ?? formatDate(invoice.created_at);

    // Older invoices have no line items: show them as a single charge.
    const savedItems = normalizeLineItems(invoice.line_items);
    const units = Number(invoice.units ?? 1) || 1;
    const items: LineItem[] =
        savedItems.length > 0
            ? savedItems
            : [{ label: invoice.description ?? "Waste management service charge", quantity: units, unit_price: amount / units }];

    // Invoices settled before part payments existed have no payment rows, but
    // still have a single receipt of their own.
    const legacyReceipt = status === "paid" && installments.length === 0;

    return (
        <div className="doc-page min-h-screen bg-neutral-100 px-4 py-6 text-black print:bg-white">
            <div className="mx-auto max-w-3xl">
                {previewFor !== undefined && (
                    <div className="mb-3 rounded-xl border border-sky-600/30 bg-sky-100 px-4 py-2.5 text-xs font-semibold text-sky-900 print:hidden">
                        Preview only. This is exactly what {previewFor ?? "the customer"} sees. Nothing on this page can be edited.
                    </div>
                )}

                <div
                    id="invoice-sheet"
                    className="doc-sheet space-y-4 rounded-2xl bg-[#f3eadf] p-6 text-[13px] shadow-2xl print:shadow-none"
                >
                    <DocumentHeader
                        title="INVOICE"
                        subtitle="Lagos Waste Management Authority"
                        right={
                            <>
                                <p><span className="font-semibold">Invoice No:</span> {number}</p>
                                <p><span className="font-semibold">Month:</span> {month}</p>
                                <p><span className="font-semibold">Issued:</span> {formatDate(invoice.created_at)}</p>
                                <p>
                                    <span className="font-semibold">Status:</span>{" "}
                                    <span
                                        className={`font-bold uppercase ${
                                            status === "paid" ? "text-emerald-700" : partPaid ? "text-amber-700" : "text-red-700"
                                        }`}
                                    >
                                        {statusLabel}
                                    </span>
                                </p>
                            </>
                        }
                    />

                    <PropertyDetailsBlock customer={customer} fallbackName={fallbackName} />

                    <div className="overflow-hidden rounded-lg border border-black/15">
                        <table className="min-w-full text-left text-xs">
                            <thead className="bg-white/60">
                            <tr>
                                <th className="px-3 py-2">Description</th>
                                <th className="px-3 py-2 text-right">Qty</th>
                                <th className="px-3 py-2 text-right">Unit price</th>
                                <th className="px-3 py-2 text-right">Amount</th>
                            </tr>
                            </thead>
                            <tbody>
                            {items.map((item, index) => (
                                <tr key={`${item.label}-${index}`} className="border-t border-black/10">
                                    <td className="px-3 py-2">
                                        <span className="font-medium">{item.label}</span>
                                        {item.note && <span className="ml-2 text-[11px] text-black/55">({item.note})</span>}
                                    </td>
                                    <td className="px-3 py-2 text-right">{item.quantity}</td>
                                    <td className="px-3 py-2 text-right">{naira(item.unit_price)}</td>
                                    <td className="px-3 py-2 text-right">{naira(item.quantity * item.unit_price)}</td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-[1fr_15rem]">
                        {balance > 0 ? (
                            <PaymentDetailsBlock reference={number} />
                        ) : (
                            <div className="rounded-lg border border-emerald-700/40 bg-white/60 p-3 text-xs font-semibold text-emerald-800">
                                This invoice has been paid in full. Thank you.
                            </div>
                        )}

                        <div className="space-y-1.5 self-start text-xs">
                            <div className="flex justify-between border-b border-black/15 pb-1.5">
                                <span>Current charges</span>
                                <span>{naira(amount)}</span>
                            </div>
                            <div className="flex justify-between border-b border-black/15 pb-1.5">
                                <span>Arrears</span>
                                <span>{naira(arrears)}</span>
                            </div>
                            {paid > 0 && (
                                <>
                                    <div className="flex justify-between border-b border-black/15 pb-1.5 font-semibold">
                                        <span>Total</span>
                                        <span>{naira(total)}</span>
                                    </div>
                                    <div className="flex justify-between border-b border-black/15 pb-1.5 text-emerald-800">
                                        <span>Paid so far</span>
                                        <span>{naira(paid)}</span>
                                    </div>
                                </>
                            )}
                            <div className="flex justify-between text-base font-bold">
                                <span>{paid > 0 ? "Balance due" : "Total due"}</span>
                                <span>{naira(paid > 0 ? balance : total)}</span>
                            </div>
                        </div>
                    </div>

                    {installments.length > 0 && (
                        <div className="overflow-hidden rounded-lg border border-black/15">
                            <p className="bg-white/60 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.15em] text-black/55">
                                Payments received
                            </p>
                            <table className="min-w-full text-left text-xs">
                                <thead className="bg-white/40">
                                <tr>
                                    <th className="px-3 py-1.5">Date</th>
                                    <th className="px-3 py-1.5">Receipt</th>
                                    <th className="px-3 py-1.5 text-right">Paid</th>
                                    <th className="px-3 py-1.5 text-right">Balance after</th>
                                </tr>
                                </thead>
                                <tbody>
                                {installments.map((item) => (
                                    <tr key={item.id} className="border-t border-black/10">
                                        <td className="px-3 py-1.5">{formatDate(item.paid_at)}</td>
                                        <td className="px-3 py-1.5">
                                            <Link href={`${basePath}/receipts/${item.id}`} className="font-semibold underline underline-offset-2">
                                                {receiptNumber(item.id)}
                                            </Link>
                                        </td>
                                        <td className="px-3 py-1.5 text-right">{naira(Number(item.amount))}</td>
                                        <td className="px-3 py-1.5 text-right">{naira(Number(item.balance_after))}</td>
                                    </tr>
                                ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    <SupportBlock />
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
                    <Link href={`${basePath}/payments`} className="text-sm font-semibold text-black/60 hover:text-black">
                        Back to payments
                    </Link>
                    <div className="flex flex-wrap items-center justify-end gap-3">
                        {legacyReceipt && (
                            <Link
                                href={`${basePath}/receipts/${invoice.id}`}
                                className="rounded-xl border border-black/20 bg-white/70 px-4 py-2.5 text-sm font-semibold text-black hover:bg-white"
                            >
                                View receipt {receiptNumber(invoice.id)}
                            </Link>
                        )}
                        <DocumentActions
                            targetId="invoice-sheet"
                            fileName={`Jigzack-invoice-${number}`}
                            title={`Jigzack invoice ${number}`}
                            shareText={`Jigzack Cleaning Services invoice ${number} for ${month}: ${naira(balance > 0 ? balance : total)} ${balance > 0 ? "due" : "(paid)"}.`}
                            printLabel="Print invoice"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
