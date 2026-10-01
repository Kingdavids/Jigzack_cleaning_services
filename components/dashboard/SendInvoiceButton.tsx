'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { sendInvoiceToCustomer } from "@/app/admin/actions";
import ConfirmDialog from "@/components/dashboard/ConfirmDialog";

// Emails the customer this invoice as it stands now, after a confirmation.
export default function SendInvoiceButton({
                                              paymentId,
                                              customerName,
                                              month,
                                              amountText,
                                              alreadySent,
                                          }: {
    paymentId: string;
    customerName: string;
    month: string;
    // What they will be asked to pay, already formatted.
    amountText: string;
    alreadySent: boolean;
}) {
    const router = useRouter();
    const [asking, setAsking] = useState(false);
    const [busy, setBusy] = useState(false);

    const send = async () => {
        setBusy(true);
        const result = await sendInvoiceToCustomer(paymentId);
        setBusy(false);
        setAsking(false);

        if (!result.success) {
            toast.error(result.error ?? "Could not send it.");
            return;
        }

        toast.success(result.message ?? "Invoice sent");
        router.refresh();
    };

    return (
        <>
            <button
                type="button"
                onClick={() => setAsking(true)}
                disabled={busy}
                className="inline-flex items-center gap-1.5 font-semibold text-amber-300 underline underline-offset-2 hover:text-amber-200 disabled:opacity-60"
            >
                <Send className="h-3.5 w-3.5" />
                {alreadySent ? "Send updated invoice" : "Send to customer"}
            </button>

            <ConfirmDialog
                open={asking}
                title={alreadySent ? "Send the updated invoice?" : "Send this invoice?"}
                confirmLabel="Yes, email it"
                busy={busy}
                onConfirm={send}
                onCancel={() => setAsking(false)}
            >
                <p>
                    {customerName} gets an email for their <span className="font-bold text-white">{month}</span> invoice, asking for{" "}
                    <span className="font-bold text-white">{amountText}</span>, with a link to it in their dashboard.
                </p>
                {alreadySent && <p className="mt-2">It says this one replaces the invoice they were sent before.</p>}
            </ConfirmDialog>
        </>
    );
}
