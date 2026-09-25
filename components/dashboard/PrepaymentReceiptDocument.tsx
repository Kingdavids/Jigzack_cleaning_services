import Link from "next/link";
import { formatDate, naira, receiptNumber } from "@/lib/customer/billing";
import type { Prepayment } from "@/lib/billing/prepaid";
import DocumentActions from "@/components/dashboard/DocumentActions";
import { DocumentHeader, PropertyDetailsBlock, SupportBlock } from "@/components/dashboard/DocumentParts";

type PropertyProps = Parameters<typeof PropertyDetailsBlock>[0]["customer"];

// The receipt for money paid upfront for a number of months.
export default function PrepaymentReceiptDocument({
                                                      prepayment,
                                                      customer,
                                                      fallbackName,
                                                      basePath,
                                                      previewFor,
                                                  }: {
    prepayment: Prepayment;
    customer: PropertyProps;
    fallbackName?: string | null;
    basePath: "/customer" | "/admin";
    previewFor?: string | null;
}) {
    const number = receiptNumber(prepayment.id);
    const amount = Number(prepayment.amount);
    const each = prepayment.months > 0 ? amount / prepayment.months : amount;
    const first = prepayment.covered_months[0];
    const last = prepayment.covered_months[prepayment.covered_months.length - 1];

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
                                <p><span className="font-semibold">Date paid:</span> {formatDate(prepayment.paid_at)}</p>
                                <p><span className="font-semibold">Paid for:</span> {prepayment.months} month{prepayment.months === 1 ? "" : "s"}</p>
                            </>
                        }
                    />

                    <div className="flex items-center justify-between gap-4">
                        <div className="inline-block rotate-[-3deg] rounded-md border-4 border-emerald-700 px-4 py-0.5 text-xl font-black tracking-[0.12em] text-emerald-700">
                            PAID IN ADVANCE
                        </div>
                        <div className="text-right text-xs leading-5">
                            <p><span className="font-semibold">Payment method:</span> {prepayment.method ?? "Not recorded"}</p>
                            {prepayment.reference && <p><span className="font-semibold">Reference:</span> {prepayment.reference}</p>}
                        </div>
                    </div>

                    <PropertyDetailsBlock customer={customer} fallbackName={fallbackName} />

                    <div className="overflow-x-auto rounded-lg border border-black/15">
                        <table className="min-w-full text-left text-xs">
                            <thead className="bg-white/60">
                            <tr>
                                <th className="px-3 py-2">Month covered</th>
                                <th className="px-3 py-2 text-right">Amount</th>
                            </tr>
                            </thead>
                            <tbody>
                            {prepayment.covered_months.map((month) => (
                                <tr key={month} className="border-t border-black/10">
                                    <td className="px-3 py-2">Waste management service, {month}</td>
                                    <td className="px-3 py-2 text-right">{naira(Math.round(each * 100) / 100)}</td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="ml-auto max-w-xs space-y-1.5 text-xs">
                        <div className="flex justify-between text-base font-bold">
                            <span>Total paid</span>
                            <span>{naira(amount)}</span>
                        </div>
                        <p className="text-black/60">
                            Covers {first}
                            {prepayment.months > 1 ? ` to ${last}` : ""}. No invoice is raised for {prepayment.months === 1 ? "this month" : "these months"}.
                        </p>
                    </div>

                    <SupportBlock />

                    <p className="text-center text-[11px] text-black/55">Thank you for your payment.</p>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
                    <Link href={`${basePath}/payments`} className="text-sm font-semibold text-black/60 hover:text-black">
                        Back to payments
                    </Link>
                    <DocumentActions
                        targetId="receipt-sheet"
                        fileName={`Jigzack-receipt-${number}`}
                        title={`Jigzack receipt ${number}`}
                        shareText={`Jigzack Cleaning Services payment receipt ${number}: ${naira(amount)} paid in advance for ${prepayment.months} month${prepayment.months === 1 ? "" : "s"}.`}
                        printLabel="Print receipt"
                    />
                </div>
            </div>
        </div>
    );
}
