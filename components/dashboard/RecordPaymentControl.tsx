'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { recordPayment } from "@/app/admin/actions";
import { naira } from "@/lib/customer/billing";
import ConfirmDialog from "@/components/dashboard/ConfirmDialog";

const METHODS = ["Bank transfer", "Cash", "POS", "Other"];

// "12,500" and " 12500 " both mean 12500, whatever the phone keyboard produced.
const parseAmount = (text: string) => {
    const cleaned = text.replace(/[,\s₦]/g, "");
    return cleaned === "" || !/^\d*\.?\d{0,2}$/.test(cleaned) ? NaN : Number(cleaned);
};

const fieldClass =
    "mt-1 h-11 w-full rounded-lg border border-white/10 bg-white/8 px-3 text-base text-white outline-none placeholder:text-white/30 focus:border-amber-300/50 sm:h-10 sm:text-sm";

// Records money received against an invoice: all of the balance or part of it.
// Each payment gets its own receipt, and the invoice closes when nothing is left.
export default function RecordPaymentControl({ paymentId, balance }: { paymentId: string; balance: number }) {
    const router = useRouter();
    const [amount, setAmount] = useState(String(balance));
    const [method, setMethod] = useState(METHODS[0]);
    const [reference, setReference] = useState("");
    const [note, setNote] = useState("");
    const [confirming, setConfirming] = useState(false);
    const [saving, setSaving] = useState(false);

    const value = parseAmount(amount);
    const isNumber = Number.isFinite(value) && value > 0;
    const tooMuch = isNumber && value > balance;
    const valid = isNumber && !tooMuch;
    const isFull = valid && value === balance;

    const problem = amount.trim() === ""
        ? "Enter the amount received."
        : !isNumber
            ? "Use numbers only, for example 5000."
            : tooMuch
                ? `That is more than the ${naira(balance)} owed.`
                : null;

    const save = async () => {
        setSaving(true);
        const result = await recordPayment(paymentId, value, method, reference, note);
        setSaving(false);
        setConfirming(false);

        if (!result.success) {
            toast.error(result.error ?? "Could not record the payment.");
            return;
        }

        toast.success(result.message ?? "Payment recorded.");
        setReference("");
        setNote("");
        router.refresh();
    };

    return (
        <div className="mt-3 space-y-3 border-t border-white/10 pt-3">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-white/45">Record a payment</p>

            <div className="grid gap-3 sm:grid-cols-[11rem_10rem_1fr]">
                <label className="text-xs text-white/50">
                    Amount received (₦)
                    <input
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        aria-invalid={Boolean(problem)}
                        className={fieldClass}
                    />
                </label>
                <label className="text-xs text-white/50">
                    Method
                    <select
                        value={method}
                        onChange={(e) => setMethod(e.target.value)}
                        className="mt-1 h-11 w-full rounded-lg border border-white/10 bg-[#141518] px-2 text-base text-white outline-none sm:h-10 sm:text-sm"
                    >
                        {METHODS.map((m) => (
                            <option key={m} value={m}>
                                {m}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="text-xs text-white/50">
                    Reference (optional)
                    <input
                        value={reference}
                        onChange={(e) => setReference(e.target.value)}
                        maxLength={120}
                        placeholder="Transfer reference"
                        className={fieldClass}
                    />
                </label>
            </div>

            <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={300}
                aria-label="Note (optional)"
                placeholder="Note, for example second instalment (optional)"
                className="h-11 w-full rounded-lg border border-white/10 bg-white/8 px-3 text-base text-white outline-none placeholder:text-white/30 focus:border-amber-300/50 sm:h-10 sm:text-sm"
            />

            <div className="rounded-xl bg-black/25 px-3 py-2 text-sm">
                {problem ? (
                    <p className="text-red-300">{problem}</p>
                ) : isFull ? (
                    <p className="text-emerald-300">
                        {naira(value)} received. This settles the invoice.
                    </p>
                ) : (
                    <p className="text-amber-200">
                        {naira(value)} received. {naira(balance - value)} would still be owed.
                    </p>
                )}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <button
                    type="button"
                    onClick={() => setConfirming(true)}
                    disabled={!valid}
                    className="h-12 rounded-xl bg-emerald-500 px-5 text-sm font-bold text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50 sm:h-11"
                >
                    {valid ? (isFull ? `Record ${naira(value)} (full payment)` : `Record ${naira(value)} part payment`) : "Record payment"}
                </button>
                {value !== balance && (
                    <button
                        type="button"
                        onClick={() => setAmount(String(balance))}
                        className="h-11 text-left text-sm font-semibold text-white/60 underline underline-offset-2 hover:text-white sm:h-auto"
                    >
                        Fill the full balance ({naira(balance)})
                    </button>
                )}
            </div>

            <ConfirmDialog
                open={confirming}
                title={isFull ? "Record the full payment?" : "Record this part payment?"}
                confirmLabel={isFull ? "Yes, record it" : "Yes, record part payment"}
                busy={saving}
                onConfirm={save}
                onCancel={() => setConfirming(false)}
            >
                <p>
                    <span className="font-bold text-white">{naira(valid ? value : 0)}</span> by {method}
                    {reference.trim() ? `, ref ${reference.trim()}` : ""}.
                </p>
                <p className="mt-2">
                    {isFull
                        ? "This settles the invoice and issues a receipt to the customer."
                        : `${naira(balance - (valid ? value : 0))} will still be owed. A receipt for this part payment is issued to the customer.`}
                </p>
                <p className="mt-2 text-white/50">You can remove a payment later if it was entered by mistake.</p>
            </ConfirmDialog>
        </div>
    );
}
