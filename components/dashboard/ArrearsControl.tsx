'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setInvoiceArrears } from "@/app/admin/actions";
import { naira } from "@/lib/customer/billing";
import ConfirmDialog from "@/components/dashboard/ConfirmDialog";

const parseAmount = (text: string) => {
    const cleaned = text.replace(/[,\s₦]/g, "");
    return cleaned === "" ? 0 : /^\d*\.?\d{0,2}$/.test(cleaned) ? Number(cleaned) : NaN;
};

// Arrears on one invoice, editable right where the invoice already shows,
// instead of needing a trip to the Payments page to find it.
export default function ArrearsControl({ paymentId, current, label }: { paymentId: string; current: number; label: string }) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [value, setValue] = useState(current > 0 ? String(current) : "");
    const [confirming, setConfirming] = useState(false);
    const [busy, setBusy] = useState(false);

    const parsed = parseAmount(value);
    const valid = Number.isFinite(parsed) && parsed >= 0 && parsed !== current;

    const save = async () => {
        setBusy(true);
        const result = await setInvoiceArrears(paymentId, parsed);
        setBusy(false);
        setConfirming(false);

        if (!result.success) {
            toast.error(result.error ?? "Could not save.");
            return;
        }

        toast.success(result.message ?? "Saved");
        setOpen(false);
        router.refresh();
    };

    if (!open) {
        return (
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="text-xs font-semibold text-sky-300 underline underline-offset-2"
            >
                {current > 0 ? `Arrears: ${naira(current)}` : "Add arrears"}
            </button>
        );
    }

    return (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-black/25 p-2">
            <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Arrears (₦)"
                className="h-9 w-28 rounded-lg border border-white/10 bg-white/8 px-2 text-xs text-white outline-none placeholder:text-white/30"
            />
            <button
                type="button"
                disabled={!valid}
                onClick={() => setConfirming(true)}
                className="h-9 rounded-lg bg-amber-400 px-3 text-xs font-bold text-black disabled:cursor-not-allowed disabled:opacity-50"
            >
                Save
            </button>
            <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-9 rounded-lg border border-white/15 px-3 text-xs font-semibold text-white/80"
            >
                Cancel
            </button>

            <ConfirmDialog
                open={confirming}
                title="Set this invoice's arrears?"
                confirmLabel="Yes, save it"
                busy={busy}
                onConfirm={save}
                onCancel={() => setConfirming(false)}
            >
                <p>
                    {label}&apos;s arrears become <span className="font-bold text-white">{naira(parsed || 0)}</span>, added on top of its charges.
                    This updates for the customer right away.
                </p>
            </ConfirmDialog>
        </div>
    );
}
