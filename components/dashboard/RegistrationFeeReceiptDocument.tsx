import Link from "next/link";
import { formatDate, naira } from "@/lib/customer/billing";
import DocumentActions from "@/components/dashboard/DocumentActions";
import { DocumentHeader, PropertyDetailsBlock, SupportBlock } from "@/components/dashboard/DocumentParts";

type PropertyProps = Parameters<typeof PropertyDetailsBlock>[0]["customer"];

// The one-time registration fee's own receipt, laid out the same way as every
// other payment receipt, instead of just linking to whatever proof-of-transfer
// photo the customer originally uploaded.
export default function RegistrationFeeReceiptDocument({
                                                            customer,
                                                            fallbackName,
                                                            basePath,
                                                            previewFor,
                                                            amount,
                                                            paidAt,
                                                            reference,
                                                        }: {
    customer: PropertyProps;
    fallbackName?: string | null;
    basePath: "/customer" | "/admin";
    previewFor?: string | null;
    amount: number;
    paidAt: string | null;
    reference: string | null;
}) {
    const number = `REG-${(customer?.account_code ?? fallbackName ?? "RECEIPT")
        .toString()
        .replace(/[^A-Za-z0-9]/g, "")
        .padEnd(8, "0")
        .slice(0, 8)
        .toUpperCase()}`;

    return (
        <div className="doc-page min-h-screen bg-neutral-100 px-4 py-6 text-black print:bg-white">
            <div className="mx-auto max-w-3xl">
                {previewFor !== undefined && (
                    <div className="mb-3 rounded-xl border border-sky-600/30 bg-sky-100 px-4 py-2.5 text-xs font-semibold text-sky-900 print:hidden">
                        Preview only. This is exactly what {previewFor ?? "the customer"} sees. Nothing on this page can be edited.
                    </div>
                )}

                <div
                    id="registration-receipt-sheet"
                    className="doc-sheet space-y-4 rounded-2xl bg-[#f3eadf] p-6 text-[13px] shadow-2xl print:shadow-none"
                >
                    <DocumentHeader
                        title="PAYMENT RECEIPT"
                        subtitle="Lagos Waste Management Authority"
                        right={
                            <>
                                <p><span className="font-semibold">Receipt No:</span> {number}</p>
                                <p><span className="font-semibold">Date paid:</span> {formatDate(paidAt)}</p>
                            </>
                        }
                    />

                    <div className="flex items-center justify-between gap-4">
                        <div className="inline-block rotate-[-3deg] rounded-md border-4 border-emerald-700 px-4 py-0.5 text-2xl font-black tracking-[0.25em] text-emerald-700">
                            PAID
                        </div>
                        {reference && (
                            <div className="text-right text-xs leading-5">
                                <p><span className="font-semibold">Reference:</span> {reference}</p>
                            </div>
                        )}
                    </div>

                    <PropertyDetailsBlock customer={customer} fallbackName={fallbackName} />

                    <div className="overflow-x-auto rounded-lg border border-black/15">
                        <table className="min-w-full text-left text-xs">
                            <thead className="bg-white/60">
                            <tr>
                                <th className="px-3 py-2">Description</th>
                                <th className="px-3 py-2 text-right">Amount</th>
                            </tr>
                            </thead>
                            <tbody>
                            <tr className="border-t border-black/10">
                                <td className="px-3 py-2">One-time registration fee</td>
                                <td className="px-3 py-2 text-right">{naira(amount)}</td>
                            </tr>
                            </tbody>
                        </table>
                    </div>

                    <div className="ml-auto max-w-xs space-y-1.5 text-xs">
                        <div className="flex justify-between text-base font-bold">
                            <span>Total paid</span>
                            <span>{naira(amount)}</span>
                        </div>
                    </div>

                    <SupportBlock />

                    <p className="text-center text-[11px] text-black/55">Thank you for your payment. Your account is now active.</p>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
                    <Link href={`${basePath}/payments`} className="text-sm font-semibold text-black/60 hover:text-black">
                        Back to payments
                    </Link>
                    <DocumentActions
                        targetId="registration-receipt-sheet"
                        fileName={`Jigzack-registration-receipt-${number}`}
                        title={`Jigzack registration fee receipt ${number}`}
                        shareText={`Jigzack Cleaning Services registration fee receipt ${number}: ${naira(amount)} paid.`}
                        printLabel="Print receipt"
                    />
                </div>
            </div>
        </div>
    );
}
