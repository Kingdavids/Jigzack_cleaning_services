'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { voidPayment } from "@/app/admin/actions";
import ConfirmDialog from "@/components/dashboard/ConfirmDialog";

// For a payment that was entered by mistake. The invoice goes back to what it
// was before, and the receipt for that payment stops existing.
export default function VoidPaymentButton({ installmentId, label }: { installmentId: string; label: string }) {
    const router = useRouter();
    const [confirming, setConfirming] = useState(false);
    const [busy, setBusy] = useState(false);

    const run = async () => {
        setBusy(true);
        const result = await voidPayment(installmentId);
        setBusy(false);
        setConfirming(false);

        if (!result.success) {
            toast.error(result.error ?? "Could not remove the payment.");
            return;
        }

        toast.success(result.message ?? "Payment removed.");
        router.refresh();
    };

    return (
        <>
            <button
                type="button"
                onClick={() => setConfirming(true)}
                className="py-1 text-xs font-semibold text-red-300 underline underline-offset-2 hover:text-red-200"
            >
                Remove
            </button>

            <ConfirmDialog
                open={confirming}
                title="Remove this payment?"
                confirmLabel="Yes, remove it"
                tone="danger"
                busy={busy}
                onConfirm={run}
                onCancel={() => setConfirming(false)}
            >
                <p>
                    This removes {label}. The receipt for it will stop working and the invoice balance goes back up.
                </p>
            </ConfirmDialog>
        </>
    );
}
