'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { clearInvoiceTransferReport } from "@/app/admin/customer-actions";

// Shown above an unpaid invoice when the customer says they paid by transfer.
// Marking the invoice paid below confirms it; "Not received" clears the report.
export default function InvoiceTransferReview({
                                                  paymentId,
                                                  reportedAt,
                                                  note,
                                                  receiptUrl,
                                              }: {
    paymentId: string;
    reportedAt: string;
    note: string | null;
    receiptUrl: string | null;
}) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);

    const clear = async () => {
        if (!window.confirm("Mark this transfer as not received? The customer can report it again.")) return;

        setBusy(true);
        const result = await clearInvoiceTransferReport(paymentId);
        setBusy(false);

        if (!result.success) {
            toast.error(result.error ?? "Something went wrong.");
            return;
        }

        toast.success("Cleared");
        router.refresh();
    };

    return (
        <div className="mt-3 rounded-xl border border-amber-300/30 bg-amber-300/[0.07] p-3 text-sm">
            <p className="font-semibold text-amber-200">The customer says they paid by transfer (reported {reportedAt}).</p>
            {note && <p className="mt-1 text-white/75">Their note: {note}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-4">
                {receiptUrl ? (
                    <a href={receiptUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-amber-300 underline underline-offset-2">
                        View receipt
                    </a>
                ) : (
                    <span className="text-xs text-white/45">No receipt attached.</span>
                )}
                <button
                    type="button"
                    disabled={busy}
                    onClick={clear}
                    className="text-xs font-semibold text-red-300 underline underline-offset-2 hover:text-red-200 disabled:opacity-50"
                >
                    {busy ? "Clearing..." : "Not received"}
                </button>
            </div>
            <p className="mt-2 text-xs text-white/45">Once you have checked your account, mark the invoice paid below to confirm it.</p>
        </div>
    );
}
