'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setMonthlyRate } from "@/app/admin/actions";
import { naira } from "@/lib/customer/billing";

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
    const [busy, setBusy] = useState(false);

    const save = async (next: number | null) => {
        const before = naira(current);
        const message =
            next === null
                ? `Go back to the calculated charge of ${naira(calculated)} for ${customName}? Future monthly invoices will use it.`
                : `Change the monthly charge for ${customName} from ${before} to ${naira(next)}? Future monthly invoices will use ${naira(next)}. Invoices already sent are not changed.`;

        if (!window.confirm(message)) return;

        setBusy(true);
        const result = await setMonthlyRate(profileId, next);
        setBusy(false);

        if (!result.success) {
            toast.error(result.error ?? "Could not save.");
            return;
        }

        toast.success(result.message ?? "Saved");
        router.refresh();
    };

    const number = Number(value);
    const valid = Number.isFinite(number) && number > 0 && number !== current;

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
                    type="number"
                    min="1"
                    step="0.01"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    aria-label="New monthly charge"
                    placeholder="New monthly charge (₦)"
                    className="h-10 w-full rounded-xl border border-white/10 bg-white/8 px-3 text-sm text-white outline-none placeholder:text-white/30 sm:w-64"
                />
                <button
                    type="button"
                    disabled={busy || !valid}
                    onClick={() => save(number)}
                    className="rounded-xl bg-amber-400 px-4 py-2 text-sm font-bold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {busy ? "Saving…" : "Change monthly charge"}
                </button>
                {custom && (
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => save(null)}
                        className="text-sm font-semibold text-white/60 underline underline-offset-2 hover:text-white disabled:opacity-50"
                    >
                        Use the calculated charge
                    </button>
                )}
            </div>
        </div>
    );
}
