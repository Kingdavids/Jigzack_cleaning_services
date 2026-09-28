'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setCustomerDiscount } from "@/app/admin/actions";
import { naira } from "@/lib/customer/billing";
import ConfirmDialog from "@/components/dashboard/ConfirmDialog";

const parseAmount = (text: string) => {
    const cleaned = text.replace(/[,\s₦%]/g, "");
    return cleaned === "" || !/^\d*\.?\d{0,2}$/.test(cleaned) ? NaN : Number(cleaned);
};

// A discount for one customer, taken off their monthly charge: a percentage or
// a fixed amount. It shows as its own line on their invoice. Changing it always
// asks first, because it decides what every later invoice says.
export default function DiscountControl({
                                            profileId,
                                            customName,
                                            current,
                                        }: {
    profileId: string;
    customName: string;
    // percent is always the equivalent percentage, even when the discount was
    // set as a flat amount, so it always reads the same way the invoice does.
    current: { type: "percent" | "amount"; value: number; reason: string | null; percent: string } | null;
}) {
    const router = useRouter();
    const [type, setType] = useState<"percent" | "amount">(current?.type ?? "percent");
    const [value, setValue] = useState(current ? String(current.value) : "");
    const [reason, setReason] = useState(current?.reason ?? "");
    const [pending, setPending] = useState<{ type: "percent" | "amount"; value: number } | "remove" | null>(null);
    const [busy, setBusy] = useState(false);

    const number = parseAmount(value);
    const valid = Number.isFinite(number) && number > 0 && (type !== "percent" || number <= 100);

    const save = async () => {
        if (!pending) return;

        setBusy(true);
        const result =
            pending === "remove"
                ? await setCustomerDiscount(profileId, null, null, "")
                : await setCustomerDiscount(profileId, pending.type, pending.value, reason);
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
                <p className="text-xs uppercase tracking-[0.12em] text-white/40">Discount</p>
                {current ? (
                    <>
                        <p className="mt-0.5 text-2xl font-bold text-emerald-300">
                            {current.percent}% off
                            {current.reason && <span className="ml-2 text-sm font-normal text-white/55">{current.reason}</span>}
                        </p>
                        {current.type === "amount" && (
                            <p className="mt-0.5 text-xs text-white/45">Set as {naira(current.value)} off. Shown as a percentage on the invoice.</p>
                        )}
                    </>
                ) : (
                    <p className="mt-0.5 text-sm text-white/55">No discount given.</p>
                )}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <select
                    value={type}
                    onChange={(e) => setType(e.target.value as "percent" | "amount")}
                    aria-label="Discount type"
                    className="h-12 rounded-xl border border-white/10 bg-[#141518] px-3 text-base text-white outline-none sm:h-10 sm:text-sm"
                >
                    <option value="percent">Percent off</option>
                    <option value="amount">Amount off (₦)</option>
                </select>
                <input
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    aria-label="Discount value"
                    placeholder={type === "percent" ? "e.g. 10" : "e.g. 1000"}
                    className="h-12 w-full rounded-xl border border-white/10 bg-white/8 px-3 text-base text-white outline-none placeholder:text-white/30 focus:border-emerald-300/50 sm:h-10 sm:w-40 sm:text-sm"
                />
            </div>

            <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={200}
                aria-label="Reason (optional, shown to the customer on the invoice)"
                placeholder="Reason, shown on the invoice (optional)"
                className="h-12 w-full rounded-xl border border-white/10 bg-white/8 px-3 text-base text-white outline-none placeholder:text-white/30 focus:border-emerald-300/50 sm:h-10 sm:text-sm"
            />

            <div className="flex flex-wrap items-center gap-3">
                <button
                    type="button"
                    disabled={!valid}
                    onClick={() => setPending({ type, value: number })}
                    className="h-12 rounded-xl bg-emerald-500 px-4 text-sm font-bold text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50 sm:h-10"
                >
                    {current ? "Change discount" : "Give discount"}
                </button>
                {current && (
                    <button
                        type="button"
                        onClick={() => setPending("remove")}
                        className="h-11 text-left text-sm font-semibold text-white/60 underline underline-offset-2 hover:text-white sm:h-auto"
                    >
                        Remove discount
                    </button>
                )}
            </div>

            <ConfirmDialog
                open={pending !== null}
                title={pending === "remove" ? "Remove this discount?" : "Give this discount?"}
                confirmLabel={pending === "remove" ? "Yes, remove it" : "Yes, give it"}
                tone={pending === "remove" ? "danger" : "default"}
                busy={busy}
                onConfirm={save}
                onCancel={() => setPending(null)}
            >
                {pending === "remove" ? (
                    <p>
                        {customName} goes back to paying the usual amount. Future monthly invoices will not show a discount line.
                    </p>
                ) : (
                    pending && (
                        <p>
                            For {customName}: <span className="font-bold text-white">{pending.type === "percent" ? `${pending.value}% off` : `${naira(pending.value)} off`}</span> their
                            monthly charge, shown as its own line on the invoice. Future monthly invoices will use it. Invoices already sent are not
                            changed.
                        </p>
                    )
                )}
            </ConfirmDialog>
        </div>
    );
}
