'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { voidPayment } from "@/app/admin/actions";

// For a payment that was entered by mistake. The invoice goes back to what it
// was before, and the receipt for that payment stops existing.
export default function VoidPaymentButton({ installmentId, label }: { installmentId: string; label: string }) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);

    const run = async () => {
        if (!window.confirm(`Remove ${label}? The receipt for it will stop working and the invoice balance goes back up.`)) return;

        setBusy(true);
        const result = await voidPayment(installmentId);
        setBusy(false);

        if (!result.success) {
            toast.error(result.error ?? "Could not remove the payment.");
            return;
        }

        toast.success(result.message ?? "Payment removed.");
        router.refresh();
    };

    return (
        <button
            type="button"
            onClick={run}
            disabled={busy}
            className="text-xs font-semibold text-red-300 underline underline-offset-2 hover:text-red-200 disabled:opacity-50"
        >
            {busy ? "Removing…" : "Remove"}
        </button>
    );
}
