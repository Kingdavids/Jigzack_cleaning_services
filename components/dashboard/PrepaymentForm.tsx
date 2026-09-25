'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { recordPrepayment, voidPrepayment } from "@/app/admin/actions";
import { naira } from "@/lib/customer/billing";
import { coveredMonthsFrom, currentMonthValue } from "@/lib/billing/prepaid";
import ConfirmDialog from "@/components/dashboard/ConfirmDialog";

const METHODS = ["Bank transfer", "Cash", "POS", "Other"];

const parseAmount = (text: string) => {
    const cleaned = text.replace(/[,\s₦]/g, "");
    return cleaned === "" || !/^\d*\.?\d{0,2}$/.test(cleaned) ? NaN : Number(cleaned);
};

const fieldClass =
    "mt-1 h-11 w-full rounded-lg border border-white/10 bg-white/8 px-3 text-base text-white outline-none placeholder:text-white/30 focus:border-amber-300/50 sm:h-10 sm:text-sm";

export type PrepaymentSummary = {
    id: string;
    months: number;
    amount: number;
    span: string;
    paidOn: string;
    method: string | null;
};

// Records a customer who paid upfront for a number of months. The amount fills
// in from their monthly charge and can be changed to what was really received.
export default function PrepaymentForm({
                                           profileId,
                                           customName,
                                           monthlyCharge,
                                           canRecord,
                                           payments,
                                       }: {
    profileId: string;
    customName: string;
    monthlyCharge: number;
    canRecord: boolean;
    payments: PrepaymentSummary[];
}) {
    const router = useRouter();
    const [months, setMonths] = useState("3");
    const [firstMonth, setFirstMonth] = useState(currentMonthValue());
    // Once the amount is typed by hand it stops following months x monthly charge.
    const [typedAmount, setTypedAmount] = useState<string | null>(null);
    const [method, setMethod] = useState(METHODS[0]);
    const [reference, setReference] = useState("");
    const [note, setNote] = useState("");
    const [settle, setSettle] = useState(true);
    const [confirming, setConfirming] = useState(false);
    const [saving, setSaving] = useState(false);
    const [removing, setRemoving] = useState<PrepaymentSummary | null>(null);

    const count = Math.trunc(Number(months));
    const countOk = Number.isFinite(count) && count >= 1 && count <= 36;
    const suggested = countOk ? count * monthlyCharge : 0;
    const amountText = typedAmount ?? (suggested > 0 ? String(suggested) : "");
    const amount = parseAmount(amountText);
    const amountOk = Number.isFinite(amount) && amount > 0;
    const covered = countOk && firstMonth ? coveredMonthsFrom(firstMonth, count) : [];
    const span = covered.length > 0 ? `${covered[0]}${covered.length > 1 ? ` to ${covered[covered.length - 1]}` : ""}` : "";
    const valid = countOk && amountOk && covered.length > 0;

    const save = async () => {
        setSaving(true);
        const result = await recordPrepayment({ profileId, months: count, firstMonth, amount, method, reference, note, settleExisting: settle });
        setSaving(false);
        setConfirming(false);

        if (!result.success) {
            toast.error(result.error ?? "Could not record it.");
            return;
        }

        toast.success(result.message ?? "Recorded.");
        setReference("");
        setNote("");
        setTypedAmount(null);
        router.refresh();
    };

    const remove = async () => {
        if (!removing) return;

        setSaving(true);
        const result = await voidPrepayment(removing.id);
        setSaving(false);
        setRemoving(null);

        if (!result.success) {
            toast.error(result.error ?? "Could not remove it.");
            return;
        }

        toast.success(result.message ?? "Removed.");
        router.refresh();
    };

    return (
        <div className="space-y-5">
            {payments.length > 0 && (
                <ul className="space-y-2">
                    {payments.map((p) => (
                        <li
                            key={p.id}
                            className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm"
                        >
                            <span className="font-bold text-emerald-300">{naira(p.amount)}</span>
                            <span className="text-white/80">
                                {p.months} month{p.months === 1 ? "" : "s"}: {p.span}
                            </span>
                            <span className="text-xs text-white/45">
                                Received {p.paidOn}
                                {p.method ? ` · ${p.method}` : ""}
                            </span>
                            <Link href={`/admin/receipts/${p.id}`} className="text-xs font-semibold text-amber-300 underline underline-offset-2">
                                Preview receipt
                            </Link>
                            {canRecord && (
                                <button
                                    type="button"
                                    onClick={() => setRemoving(p)}
                                    className="py-1 text-xs font-semibold text-red-300 underline underline-offset-2 hover:text-red-200"
                                >
                                    Remove
                                </button>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            {canRecord ? (
                <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-white/45">Record an advance payment</p>

                    <div className="grid gap-3 sm:grid-cols-[8rem_11rem_1fr]">
                        <label className="text-xs text-white/50">
                            Months paid for
                            <input
                                type="number"
                                inputMode="numeric"
                                min={1}
                                max={36}
                                value={months}
                                onChange={(e) => setMonths(e.target.value)}
                                className={fieldClass}
                            />
                        </label>
                        <label className="text-xs text-white/50">
                            Starting from
                            <input type="month" value={firstMonth} onChange={(e) => setFirstMonth(e.target.value)} className={fieldClass} />
                        </label>
                        <label className="text-xs text-white/50">
                            Amount received (₦)
                            <input
                                type="text"
                                inputMode="decimal"
                                autoComplete="off"
                                value={amountText}
                                onChange={(e) => setTypedAmount(e.target.value)}
                                className={fieldClass}
                            />
                        </label>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-[11rem_1fr]">
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
                            <input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} className={fieldClass} />
                        </label>
                    </div>

                    <input
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        maxLength={300}
                        aria-label="Note (optional)"
                        placeholder="Note (optional)"
                        className="h-11 w-full rounded-lg border border-white/10 bg-white/8 px-3 text-base text-white outline-none placeholder:text-white/30 focus:border-amber-300/50 sm:h-10 sm:text-sm"
                    />

                    <label className="flex min-h-11 cursor-pointer items-start gap-2.5 text-sm text-white/70">
                        <input type="checkbox" checked={settle} onChange={(e) => setSettle(e.target.checked)} className="mt-1 h-4 w-4 accent-amber-400" />
                        <span>If an invoice already exists for one of these months, mark it paid from this advance payment.</span>
                    </label>

                    <div className="rounded-xl bg-black/25 px-3 py-2 text-sm">
                        {!countOk ? (
                            <p className="text-red-300">Choose between 1 and 36 months.</p>
                        ) : !amountOk ? (
                            <p className="text-red-300">Enter the amount received.</p>
                        ) : (
                            <p className="text-emerald-300">
                                {naira(amount)} covers {span}. No invoices are made for {count === 1 ? "that month" : "those months"}.
                                {monthlyCharge > 0 && amount !== suggested && (
                                    <span className="text-white/50"> Their monthly charge would come to {naira(suggested)}.</span>
                                )}
                            </p>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={() => setConfirming(true)}
                        disabled={!valid}
                        className="h-12 w-full rounded-xl bg-emerald-500 px-5 text-sm font-bold text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50 sm:h-11 sm:w-auto"
                    >
                        Record advance payment
                    </button>
                </div>
            ) : (
                payments.length === 0 && <p className="text-sm text-white/55">No advance payments.</p>
            )}

            <ConfirmDialog
                open={confirming}
                title="Record this advance payment?"
                confirmLabel="Yes, record it"
                busy={saving}
                onConfirm={save}
                onCancel={() => setConfirming(false)}
            >
                <p>
                    <span className="font-bold text-white">{naira(valid ? amount : 0)}</span> from {customName} by {method}, covering{" "}
                    <span className="font-bold text-white">{span}</span> ({count} month{count === 1 ? "" : "s"}).
                </p>
                <p className="mt-2">
                    A receipt is issued to the customer, and no invoices are made for those months.
                    {settle ? " Any invoice that already exists for them is marked paid." : ""}
                </p>
            </ConfirmDialog>

            <ConfirmDialog
                open={removing !== null}
                title="Remove this advance payment?"
                confirmLabel="Yes, remove it"
                tone="danger"
                busy={saving}
                onConfirm={remove}
                onCancel={() => setRemoving(null)}
            >
                <p>
                    This removes the {removing ? naira(removing.amount) : ""} payment covering {removing?.span}. Its receipt stops working, invoices it
                    settled go back to unpaid, and invoices are made for those months again.
                </p>
            </ConfirmDialog>
        </div>
    );
}
