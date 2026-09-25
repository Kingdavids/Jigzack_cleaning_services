import Link from "next/link";
import { formatDate, invoiceNumber, naira, receiptNumber } from "@/lib/customer/billing";
import { normalizeLineItems } from "@/lib/billing/pricing";
import { invoiceTotal, round2, type Installment } from "@/lib/billing/balance";
import DocumentActions from "@/components/dashboard/DocumentActions";
import { DocumentHeader, PropertyDetailsBlock, SupportBlock } from "@/components/dashboard/DocumentParts";

type PropertyProps = Parameters<typeof PropertyDetailsBlock>[0]["customer"];

type PaymentRecord = {
    id: string;
    amount: number | string | null;
    arrears?: number | string | null;
    units?: number | string | null;
    status?: string | null;
    description?: string | null;
    invoice_month?: string | null;
    line_items?: unknown;
    paid_at?: string | null;
    payment_method?: string | null;
    payment_reference?: string | null;
    created_at: string;
};

// A receipt for one payment. When the invoice was paid in instalments, each
// instalment has its own receipt that shows what was paid before it, what it
// covers and what is still owed. An invoice paid in one go before instalments
// existed has a single receipt, laid out as it always was.
export default function ReceiptDocument({
                                            payment,
                                            installment,
                                            installments,
                                            customer,
                                            fallbackName,
                                            basePath,
                                            previewFor,
                                        }: {
    payment: PaymentRecord;
    installment: Installment | null;
    installments: Installment[];
    customer: PropertyProps;
    fallbackName?: string | null;
    basePath: "/customer" | "/admin";
    previewFor?: string | null;
}) {
    const amount = Number(payment.amount ?? 0);
    const arrears = Number(payment.arrears ?? 0);
    const total = invoiceTotal(payment);
    const month = payment.invoice_month ?? formatDate(payment.created_at);
    const items = normalizeLineItems(payment.line_items);
    const units = Number(payment.units ?? 1) || 1;

    const thisPayment = installment ? round2(Number(installment.amount)) : total;
    const paidAt = installment?.paid_at ?? payment.paid_at ?? payment.created_at;
    const number = receiptNumber(installment?.id ?? payment.id);
    const method = installment?.method ?? payment.payment_method;
    const reference = installment?.reference ?? payment.payment_reference;

    // Where this payment sits among the invoice's payments.
    const position = installment ? installments.findIndex((i) => i.id === installment.id) + 1 : 1;
    const balanceAfter = installment ? round2(Number(installment.balance_after)) : 0;
    const paidBefore = installment ? round2(total - balanceAfter - thisPayment) : 0;
    const settled = balanceAfter === 0;

    return (
        <div className="doc-page min-h-screen bg-neutral-100 px-4 py-6 text-black print:bg-white">
            <div className="mx-auto max-w-3xl">
                {previewFor !== undefined && (
                    <div className="mb-3 rounded-xl border border-sky-600/30 bg-sky-100 px-4 py-2.5 text-xs font-semibold text-sky-900 print:hidden">
                        Preview only. This is exactly what {previewFor ?? "the customer"} sees. Nothing on this page can be edited.
                    </div>
                )}

                <div
                    id="receipt-sheet"
                    className="doc-sheet space-y-4 rounded-2xl bg-[#f3eadf] p-6 text-[13px] shadow-2xl print:shadow-none"
                >
                    <DocumentHeader
                        title="PAYMENT RECEIPT"
                        subtitle="Lagos Waste Management Authority"
                        right={
                            <>
                                <p><span className="font-semibold">Receipt No:</span> {number}</p>
                                <p><span className="font-semibold">Date paid:</span> {formatDate(paidAt)}</p>
                                <p><span className="font-semibold">Invoice:</span> {invoiceNumber(payment.id)}</p>
                                <p><span className="font-semibold">Month:</span> {month}</p>
                                {installment && installments.length > 1 && (
                                    <p><span className="font-semibold">Payment:</span> {position} of {installments.length}</p>
                                )}
                            </>
                        }
                    />

                    <div className="flex items-center justify-between gap-4">
                        <div
                            className={`inline-block rotate-[-3deg] rounded-md border-4 px-4 py-0.5 font-black ${
                                settled
                                    ? "border-emerald-700 text-2xl tracking-[0.25em] text-emerald-700"
                                    : "border-amber-700 text-xl tracking-[0.12em] text-amber-700"
                            }`}
                        >
                            {settled ? "PAID" : "PART PAYMENT"}
                        </div>
                        <div className="text-right text-xs leading-5">
                            <p><span className="font-semibold">Payment method:</span> {method ?? "Not recorded"}</p>
                            {reference && <p><span className="font-semibold">Reference:</span> {reference}</p>}
                        </div>
                    </div>

                    <PropertyDetailsBlock customer={customer} fallbackName={fallbackName} />

                    <div className="overflow-x-auto rounded-lg border border-black/15">
                        <table className="min-w-full text-left text-xs">
                            <thead className="bg-white/60">
                            <tr>
                                <th className="px-3 py-2">Invoice charges</th>
                                <th className="px-3 py-2 text-right">Qty</th>
                                <th className="px-3 py-2 text-right">Amount</th>
                            </tr>
                            </thead>
                            <tbody>
                            {items.length > 0 ? (
                                items.map((item, index) => (
                                    <tr key={`${item.label}-${index}`} className="border-t border-black/10">
                                        <td className="px-3 py-2">
                                            <span className="font-medium">{item.label}</span>
                                            {item.note && <span className="ml-2 text-[11px] text-black/55">({item.note})</span>}
                                        </td>
                                        <td className="px-3 py-2 text-right">{item.quantity}</td>
                                        <td className="px-3 py-2 text-right">{naira(item.quantity * item.unit_price)}</td>
                                    </tr>
                                ))
                            ) : (
                                <tr className="border-t border-black/10">
                                    <td className="px-3 py-2">{payment.description ?? "Waste management service charge"}</td>
                                    <td className="px-3 py-2 text-right">{units}</td>
                                    <td className="px-3 py-2 text-right">{naira(amount)}</td>
                                </tr>
                            )}
                            {arrears > 0 && (
                                <tr className="border-t border-black/10">
                                    <td className="px-3 py-2">Arrears</td>
                                    <td className="px-3 py-2 text-right">1</td>
                                    <td className="px-3 py-2 text-right">{naira(arrears)}</td>
                                </tr>
                            )}
                            </tbody>
                        </table>
                    </div>

                    <div className="ml-auto max-w-xs space-y-1.5 text-xs">
                        {installment ? (
                            <>
                                <div className="flex justify-between border-b border-black/15 pb-1.5">
                                    <span>Invoice total</span>
                                    <span>{naira(total)}</span>
                                </div>
                                <div className="flex justify-between border-b border-black/15 pb-1.5">
                                    <span>Paid before this payment</span>
                                    <span>{naira(paidBefore)}</span>
                                </div>
                                <div className="flex justify-between text-base font-bold">
                                    <span>Paid now</span>
                                    <span>{naira(thisPayment)}</span>
                                </div>
                                <div
                                    className={`flex justify-between border-t border-black/15 pt-1.5 font-bold ${
                                        settled ? "text-emerald-800" : "text-red-700"
                                    }`}
                                >
                                    <span>Balance remaining</span>
                                    <span>{naira(balanceAfter)}</span>
                                </div>
                            </>
                        ) : (
                            <div className="flex justify-between text-base font-bold">
                                <span>Total paid</span>
                                <span>{naira(total)}</span>
                            </div>
                        )}
                    </div>

                    <SupportBlock />

                    <p className="text-center text-[11px] text-black/55">
                        {settled ? "Thank you for your payment." : "Thank you for your payment. The balance is still due on this invoice."}
                    </p>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
                    <div className="flex flex-wrap items-center gap-4">
                        <Link href={`${basePath}/payments`} className="text-sm font-semibold text-black/60 hover:text-black">
                            Back to payments
                        </Link>
                        <Link href={`${basePath}/invoices/${payment.id}`} className="text-sm font-semibold text-black/60 hover:text-black">
                            View invoice
                        </Link>
                    </div>
                    <DocumentActions
                        targetId="receipt-sheet"
                        fileName={`Jigzack-receipt-${number}`}
                        title={`Jigzack receipt ${number}`}
                        shareText={`Jigzack Cleaning Services payment receipt ${number} for ${month}: ${naira(thisPayment)} paid${settled ? "" : `, ${naira(balanceAfter)} still due`}.`}
                        printLabel="Print receipt"
                    />
                </div>
            </div>
        </div>
    );
}
