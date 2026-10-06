'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setMonthlyRate } from "@/app/admin/actions/billing";
import { naira } from "@/lib/customer/billing";
import ConfirmDialog from "@/components/dashboard/ConfirmDialog";

// Clears an estate's account-level fixed monthly charge right from the
// Estates page, so its unit prices take over without a trip to its customer
// page. Same action as "Use the calculated charge" there.
export default function ClearFixedChargeButton({ profileId, current, calculated }: { profileId: string; current: number; calculated: number }) {
    const router = useRouter();
    const [confirming, setConfirming] = useState(false);
    const [busy, setBusy] = useState(false);

    const clear = async () => {
        setBusy(true);
        const result = await setMonthlyRate(profileId, null);
        setBusy(false);

        if (!result.success) {
            toast.error(result.error ?? "Could not clear it.");
            return;
        }

        toast.success(result.message ?? "Cleared");
        setConfirming(false);
        router.refresh();
    };

    return (
        <>
            <button
                type="button"
                onClick={() => setConfirming(true)}
                className="font-semibold text-amber-200 underline underline-offset-2"
            >
                Clear it
            </button>

            <ConfirmDialog
                open={confirming}
                title="Clear the fixed monthly charge?"
                confirmLabel="Yes, clear it"
                busy={busy}
                onConfirm={clear}
                onCancel={() => setConfirming(false)}
            >
                <p>
                    Goes from <span className="font-bold text-white">{naira(current)}</span> to the unit prices below, currently{" "}
                    <span className="font-bold text-white">{naira(calculated)}</span>. This month&apos;s open invoice is updated if it hasn&apos;t
                    been touched yet.
                </p>
            </ConfirmDialog>
        </>
    );
}
