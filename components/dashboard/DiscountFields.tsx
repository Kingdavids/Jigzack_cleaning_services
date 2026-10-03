'use client';

import type { DiscountInput } from "@/lib/billing/discount-line";

// The discount part of an invoice form: none, a percentage or a fixed amount,
// and a reason printed on the invoice. Used when creating and editing invoices.
export default function DiscountFields({
                                           value,
                                           onChange,
                                           charges,
                                           inputClass,
                                       }: {
    value: DiscountInput;
    onChange: (value: DiscountInput) => void;
    // What the discount comes off, to say when nothing has been entered yet.
    charges: number;
    inputClass: string;
}) {
    const labelClass = "mb-1 block text-[11px] uppercase tracking-[0.12em] text-white/40";

    return (
        <fieldset className="rounded-xl border border-white/10 bg-black/20 p-3">
            <legend className="px-1 text-xs font-semibold text-white/70">Discount</legend>
            <div className="grid gap-3 sm:grid-cols-[11rem_9rem_1fr]">
                <label className="block">
                    <span className={labelClass}>Type</span>
                    <select
                        value={value.kind}
                        onChange={(e) => onChange({ ...value, kind: e.target.value as DiscountInput["kind"] })}
                        className={`${inputClass} bg-[#141518]`}
                    >
                        <option value="none">No discount</option>
                        <option value="percent">Percentage (%)</option>
                        <option value="amount">Fixed amount (₦)</option>
                    </select>
                </label>
                {value.kind !== "none" && (
                    <>
                        <label className="block">
                            <span className={labelClass}>{value.kind === "percent" ? "Percent off" : "Amount off (₦)"}</span>
                            <input
                                type="number"
                                min="0"
                                max={value.kind === "percent" ? 100 : undefined}
                                step="0.01"
                                value={value.value || ""}
                                onChange={(e) => onChange({ ...value, value: Math.max(0, Number(e.target.value) || 0) })}
                                placeholder="0"
                                className={inputClass}
                            />
                        </label>
                        <label className="block">
                            <span className={labelClass}>Reason (shown on the invoice)</span>
                            <input
                                value={value.reason}
                                onChange={(e) => onChange({ ...value, reason: e.target.value.slice(0, 80) })}
                                placeholder="e.g. Loyal customer"
                                className={inputClass}
                            />
                        </label>
                    </>
                )}
            </div>
            {value.kind !== "none" && value.value === 0 && charges > 0 && <p className="mt-2 text-xs text-white/45">Enter how much to take off.</p>}
        </fieldset>
    );
}
