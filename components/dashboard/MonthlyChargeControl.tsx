'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setMonthlyRate } from "@/app/admin/actions";
import { naira } from "@/lib/customer/billing";
import ConfirmDialog from "@/components/dashboard/ConfirmDialog";

const parseAmount = (text: string) => {
    const cleaned = text.replace(/[,\s₦]/g, "");
    return cleaned === "" || !/^\d*\.?\d{0,2}$/.test(cleaned) ? NaN : Number(cleaned);
};

// The amount used for a customer's monthly invoices. Changing it always asks
// first, because it decides what every later invoice says.
export default function MonthlyChargeControl({
                                                 profileId,
                                                 customName,
                                                 current,
                                                 calculated,
                                                 custom,
                                             }: {
    profileId: string;
    customName: string;
    // What monthly invoices use right now.
    current: number;
    // What the property details work out to.
    calculated: number;
    // True when an admin has set the amount by hand.
    custom: boolean;
}) {
    const router = useRouter();
    const [value, setValue] = useState(current > 0 ? String(current) : "");
    // The change waiting for a yes: a new amount, or null for "use the calculated charge".
    const [pendingChange, setPendingChange] = useState<{ next: number | null } | null>(null);
    const [busy, setBusy] = useState(false);

    const number = parseAmount(value);
    const valid = Number.isFinite(number) && number > 0 && number !== current;

    const save = async () => {
        if (!pendingChange) return;

        setBusy(true);
        const result = await setMonthlyRate(profileId, pendingChange.next);
        setBusy(false);
        setPendingChange(null);

        if (!result.success) {
            toast.error(result.error ?? "Could not save.");
            return;
        }

        toast.success(result.message ?? "Saved");
        router.refresh();
    };

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
                <div>
                    <p className="text-xs uppercase tracking-[0.12em] text-white/40">Used for monthly invoices</p>
                    <p className="mt-0.5 text-2xl font-bold text-amber-300">{current > 0 ? naira(current) : "Not set"}</p>
                </div>
                <div className="text-sm text-white/55">
                    {custom ? (
                        <>Set by an admin. Their property details would give {calculated > 0 ? naira(calculated) : "no price"}.</>
                    ) : (
                        <>Worked out from their property details.</>
                    )}
                </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    aria-label="New monthly charge"
                    placeholder="New monthly charge (₦)"
                    className="h-12 w-full rounded-xl border border-white/10 bg-white/8 px-3 text-base text-white outline-none placeholder:text-white/30 focus:border-amber-300/50 sm:h-10 sm:w-64 sm:text-sm"
                />
                <button
                    type="button"
                    disabled={!valid}
                    onClick={() => setPendingChange({ next: number })}
                    className="h-12 rounded-xl bg-amber-400 px-4 text-sm font-bold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50 sm:h-10"
                >
                    Change monthly charge
                </button>
                {custom && (
                    <button
                        type="button"
                        onClick={() => setPendingChange({ next: null })}
                        className="h-11 text-left text-sm font-semibold text-white/60 underline underline-offset-2 hover:text-white sm:h-auto"
                    >
                        Use the calculated charge
                    </button>
                )}
            </div>

            <ConfirmDialog
                open={pendingChange !== null}
                title="Change the monthly charge?"
                confirmLabel="Yes, change it"
                busy={busy}
                onConfirm={save}
                onCancel={() => setPendingChange(null)}
            >
                {pendingChange?.next === null ? (
                    <p>
                        {customName} goes back to the calculated charge of <span className="font-bold text-white">{naira(calculated)}</span>. Future
                        monthly invoices will use it.
                    </p>
                ) : (
                    <p>
                        For {customName}, from <span className="font-bold text-white">{naira(current)}</span> to{" "}
                        <span className="font-bold text-white">{naira(pendingChange?.next ?? 0)}</span>. Future monthly invoices will use the new amount.
                        Invoices already sent are not changed.
                    </p>
                )}
            </ConfirmDialog>
        </div>
    );
}
