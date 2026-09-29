'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setCustomerArrears } from "@/app/admin/actions";
import { naira } from "@/lib/customer/billing";
import ConfirmDialog from "@/components/dashboard/ConfirmDialog";

const parseAmount = (text: string) => {
    const cleaned = text.replace(/[,\s₦]/g, "");
    return cleaned === "" || !/^\d*\.?\d{0,2}$/.test(cleaned) ? NaN : Number(cleaned);
};

// Arrears waiting to land on this customer's current or next invoice. Lands
// on the current one right away if it is still untouched and unpaid, so it
// also shows up in "Preview before generating" straight away.
export default function CustomerArrearsControl({
                                                    profileId,
                                                    customName,
                                                    current,
                                                }: {
    profileId: string;
    customName: string;
    current: number;
}) {
    const router = useRouter();
    const [value, setValue] = useState(current > 0 ? String(current) : "");
    const [pending, setPending] = useState<number | null>(null);
    const [busy, setBusy] = useState(false);

    const number = parseAmount(value);
    const valid = Number.isFinite(number) && number >= 0 && number !== current;

    const save = async () => {
        if (pending === null) return;

        setBusy(true);
        const result = await setCustomerArrears(profileId, pending);
        setBusy(false);
        setPending(null);

        if (!result.success) {
            toast.error(result.error ?? "Could not save.");
            return;
        }

        toast.success(result.message ?? "Saved");
        router.refresh();
    };

    return (
        <div className="space-y-3">
            <div>
                <p className="text-xs uppercase tracking-[0.12em] text-white/40">Arrears</p>
                <p className="mt-0.5 text-2xl font-bold text-amber-300">{current > 0 ? naira(current) : "None"}</p>
                <p className="mt-1 text-sm text-white/55">
                    {current > 0
                        ? "Waiting to land on their current or next invoice."
                        : "Added on top of their current or next invoice, until cleared."}
                </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    aria-label="Arrears amount"
                    placeholder="Arrears (₦)"
                    className="h-12 w-full rounded-xl border border-white/10 bg-white/8 px-3 text-base text-white outline-none placeholder:text-white/30 focus:border-amber-300/50 sm:h-10 sm:w-64 sm:text-sm"
                />
                <button
                    type="button"
                    disabled={!valid}
                    onClick={() => setPending(number)}
                    className="h-12 rounded-xl bg-amber-400 px-4 text-sm font-bold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50 sm:h-10"
                >
                    {current > 0 ? "Change arrears" : "Add arrears"}
                </button>
                {current > 0 && (
                    <button
                        type="button"
                        onClick={() => setPending(0)}
                        className="h-11 text-left text-sm font-semibold text-white/60 underline underline-offset-2 hover:text-white sm:h-auto"
                    >
                        Clear arrears
                    </button>
                )}
            </div>

            <ConfirmDialog
                open={pending !== null}
                title={pending === 0 ? "Clear this customer's arrears?" : "Set this customer's arrears?"}
                confirmLabel="Yes, save it"
                busy={busy}
                onConfirm={save}
                onCancel={() => setPending(null)}
            >
                {pending === 0 ? (
                    <p>{customName}&apos;s arrears go back to zero.</p>
                ) : (
                    <p>
                        {customName}&apos;s arrears become <span className="font-bold text-white">{naira(pending ?? 0)}</span>. It lands on their
                        current invoice right away if it&apos;s still untouched and unpaid, or their next invoice otherwise, and shows up in
                        &quot;Preview before generating&quot; either way.
                    </p>
                )}
            </ConfirmDialog>
        </div>
    );
}
