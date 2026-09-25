'use client';

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { recordPayment } from "@/app/admin/actions";
import { naira } from "@/lib/customer/billing";

const METHODS = ["Bank transfer", "Cash", "POS", "Other"];

// Records money received against an invoice: all of the balance or part of it.
// Each payment gets its own receipt, and the invoice closes when nothing is left.
export default function RecordPaymentControl({ paymentId, balance }: { paymentId: string; balance: number }) {
    const router = useRouter();
    const [amount, setAmount] = useState(String(balance));
    const [method, setMethod] = useState(METHODS[0]);
    const [reference, setReference] = useState("");
    const [note, setNote] = useState("");
    const [pending, startTransition] = useTransition();

    const value = Number(amount);
    const valid = Number.isFinite(value) && value > 0 && value <= balance;
    const isFull = valid && value === balance;

    const submit = () => {
        if (!valid) {
            toast.error(`Enter an amount between ₦1 and ${naira(balance)}.`);
            return;
        }

        const left = balance - value;
        const question = isFull
            ? `Record ${naira(value)} as received? This settles the invoice and issues a receipt to the customer.`
            : `Record ${naira(value)} as received? ${naira(left)} will still be owed, and a receipt for this part payment is issued to the customer.`;

        if (!window.confirm(question)) return;

        startTransition(async () => {
            const result = await recordPayment(paymentId, value, method, reference, note);

            if (!result.success) {
                toast.error(result.error ?? "Could not record the payment.");
                return;
            }

            toast.success(result.message ?? "Payment recorded.");
            setReference("");
            setNote("");
            router.refresh();
        });
    };

    return (
        <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-white/45">Record a payment</p>

            <div className="grid gap-2 sm:grid-cols-[9rem_9rem_1fr]">
                <label className="text-xs text-white/50">
                    Amount received (₦)
                    <input
                        type="number"
                        min="1"
                        max={balance}
                        step="0.01"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-white/8 px-3 text-sm text-white outline-none"
                    />
                </label>
                <label className="text-xs text-white/50">
                    Method
                    <select
                        value={method}
                        onChange={(e) => setMethod(e.target.value)}
                        className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-[#141518] px-2 text-sm text-white outline-none"
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
                        className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-white/8 px-3 text-sm text-white outline-none placeholder:text-white/30"
                    />
                </label>
            </div>

            <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={300}
                aria-label="Note (optional)"
                placeholder="Note, for example second instalment (optional)"
                className="h-9 w-full rounded-lg border border-white/10 bg-white/8 px-3 text-sm text-white outline-none placeholder:text-white/30"
            />

            <div className="flex flex-wrap items-center gap-3">
                <button
                    type="button"
                    onClick={submit}
                    disabled={pending || !valid}
                    className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-bold text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {pending ? "Saving…" : isFull ? "Record full payment" : "Record part payment"}
                </button>
                {value !== balance && (
                    <button
                        type="button"
                        onClick={() => setAmount(String(balance))}
                        className="text-xs font-semibold text-white/60 underline underline-offset-2 hover:text-white"
                    >
                        Fill the full balance ({naira(balance)})
                    </button>
                )}
                {valid && !isFull && <span className="text-xs text-white/45">{naira(balance - value)} would still be owed.</span>}
            </div>
        </div>
    );
}
