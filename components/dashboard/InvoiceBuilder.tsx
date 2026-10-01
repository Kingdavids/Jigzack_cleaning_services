'use client';

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { DOMESTIC_FACILITIES } from "@/lib/customer/facilities";
import { itemsTotal, monthRangeLabel, monthsFrom, UNIT_PRICES, type LineItem } from "@/lib/billing/pricing";
import MonthRangePicker, { monthSpan } from "@/components/dashboard/MonthRangePicker";

const inputClass =
    "h-11 w-full rounded-xl border border-white/10 bg-white/8 px-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-amber-300/50";

const labelClass = "mb-1 block text-[11px] uppercase tracking-[0.12em] text-white/40";

const naira = (value: number) => `₦${value.toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;

// The money part of a hand-made invoice: the property's units at their monthly
// price, how many months it covers, any other charges and arrears, with the
// total worked out as it is filled in. It submits as hidden fields alongside
// whatever form it sits in.
export default function InvoiceBuilder({
                                           defaultStartMonth,
                                           initialCounts = {},
                                       }: {
    // "YYYY-MM"
    defaultStartMonth: string;
    // Unit counts to start from, by facility key (from a customer's record).
    initialCounts?: Record<string, number>;
}) {
    const [counts, setCounts] = useState<Record<string, number>>(initialCounts);
    const [prices, setPrices] = useState<Record<string, number>>({ ...UNIT_PRICES });
    const [range, setRange] = useState({ start: defaultStartMonth, end: defaultStartMonth });
    const [others, setOthers] = useState<LineItem[]>([]);
    const [arrears, setArrears] = useState(0);

    const months = useMemo(() => monthsFrom(range.start, monthSpan(range.start, range.end)), [range]);
    const period = monthRangeLabel(months);
    const n = months.length || 1;

    const unitLines = DOMESTIC_FACILITIES.filter((f) => (counts[f.key] ?? 0) > 0).map((f) => ({
        label: n > 1 ? `${f.unitLabel} (${n} months)` : f.unitLabel,
        quantity: counts[f.key],
        unit_price: (prices[f.key] ?? 0) * n,
        note: n > 1 ? `${naira(prices[f.key] ?? 0)} a month` : undefined,
    }));

    const monthly = DOMESTIC_FACILITIES.reduce((sum, f) => sum + (counts[f.key] ?? 0) * (prices[f.key] ?? 0), 0);
    const othersTotal = itemsTotal(others.filter((o) => o.label));
    const total = monthly * n + othersTotal + arrears;

    const lineItems = [...unitLines, ...others.filter((o) => o.label && o.quantity > 0)];
    const propertyDetails = Object.fromEntries(Object.entries(counts).filter(([, c]) => c > 0).map(([k, c]) => [k, String(c)]));

    const updateOther = (index: number, patch: Partial<LineItem>) =>
        setOthers((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));

    return (
        <div className="space-y-6">
            <input type="hidden" name="lineItems" value={JSON.stringify(lineItems)} />
            <input type="hidden" name="invoiceMonth" value={period} />
            <input type="hidden" name="coveredMonths" value={JSON.stringify(months)} />
            <input type="hidden" name="propertyDetails" value={JSON.stringify(propertyDetails)} />
            <input type="hidden" name="arrears" value={arrears || ""} />

            <fieldset className="space-y-3">
                <legend className="mb-2 text-sm font-semibold">Property details</legend>
                <p className="text-xs text-white/40">Units on the property and their monthly price. Leave a type at 0 if they have none.</p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {DOMESTIC_FACILITIES.map((f) => (
                        <div key={f.key} className="rounded-xl border border-white/10 bg-black/20 p-3">
                            <p className="mb-2 text-sm font-semibold">{f.label}</p>
                            <div className="grid grid-cols-2 gap-2">
                                <label className="block">
                                    <span className={labelClass}>How many</span>
                                    <input
                                        type="number"
                                        min="0"
                                        inputMode="numeric"
                                        value={counts[f.key] ?? 0}
                                        onChange={(e) => setCounts((prev) => ({ ...prev, [f.key]: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))}
                                        className={inputClass}
                                    />
                                </label>
                                <label className="block">
                                    <span className={labelClass}>₦ a month</span>
                                    <input
                                        type="number"
                                        min="0"
                                        inputMode="decimal"
                                        value={prices[f.key] ?? 0}
                                        onChange={(e) => setPrices((prev) => ({ ...prev, [f.key]: Math.max(0, Number(e.target.value) || 0) }))}
                                        className={inputClass}
                                    />
                                </label>
                            </div>
                        </div>
                    ))}
                </div>
            </fieldset>

            <fieldset className="space-y-3">
                <legend className="mb-2 text-sm font-semibold">Months covered</legend>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
                    <MonthRangePicker start={range.start} end={range.end} onChange={setRange} />
                    <p className="text-sm text-white/60 lg:pb-3">
                        Covers <span className="font-bold text-white">{period}</span> · {n} month{n === 1 ? "" : "s"}
                    </p>
                </div>
            </fieldset>

            <fieldset className="space-y-2">
                <legend className="mb-2 text-sm font-semibold">Other charges (optional)</legend>
                <p className="text-xs text-white/40">Charged once, not per month: a commercial site, an extra pickup, a discount (a negative price).</p>
                {others.map((item, index) => (
                    <div key={index} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_80px_130px_1fr_44px]">
                        <input
                            value={item.label}
                            onChange={(e) => updateOther(index, { label: e.target.value })}
                            placeholder="Item"
                            aria-label="Item"
                            className={`${inputClass} col-span-2 sm:col-span-1`}
                        />
                        <input
                            type="number"
                            min="0"
                            value={item.quantity}
                            onChange={(e) => updateOther(index, { quantity: Number(e.target.value) })}
                            aria-label="Quantity"
                            className={inputClass}
                        />
                        <input
                            type="number"
                            value={item.unit_price}
                            onChange={(e) => updateOther(index, { unit_price: Number(e.target.value) })}
                            aria-label="Price (negative for a discount)"
                            className={inputClass}
                        />
                        <input
                            value={item.note ?? ""}
                            onChange={(e) => updateOther(index, { note: e.target.value })}
                            placeholder="Note (optional)"
                            aria-label="Note"
                            className={`${inputClass} col-span-2 sm:col-span-1`}
                        />
                        <button
                            type="button"
                            onClick={() => setOthers((prev) => prev.filter((_, i) => i !== index))}
                            aria-label="Remove charge"
                            className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 text-white/50 transition hover:text-red-300"
                        >
                            <Trash2 className="h-4 w-4" />
                        </button>
                    </div>
                ))}
                <button
                    type="button"
                    onClick={() => setOthers((prev) => [...prev, { label: "", quantity: 1, unit_price: 0 }])}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/10"
                >
                    <Plus className="h-3.5 w-3.5" />
                    Add a charge
                </button>
            </fieldset>

            <label className="block sm:w-48">
                <span className={labelClass}>Arrears (₦)</span>
                <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={arrears || ""}
                    onChange={(e) => setArrears(Math.max(0, Number(e.target.value) || 0))}
                    placeholder="0"
                    className={inputClass}
                />
            </label>

            <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-white/45">Total</p>
                <dl className="space-y-1.5">
                    <div className="flex justify-between gap-3">
                        <dt className="text-white/60">Monthly charge for the property</dt>
                        <dd>{naira(monthly)}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                        <dt className="text-white/60">
                            × {n} month{n === 1 ? "" : "s"}
                            {period ? ` (${period})` : ""}
                        </dt>
                        <dd>{naira(monthly * n)}</dd>
                    </div>
                    {others.length > 0 && (
                        <div className="flex justify-between gap-3">
                            <dt className="text-white/60">Other charges</dt>
                            <dd>{naira(othersTotal)}</dd>
                        </div>
                    )}
                    {arrears > 0 && (
                        <div className="flex justify-between gap-3">
                            <dt className="text-white/60">Arrears</dt>
                            <dd>{naira(arrears)}</dd>
                        </div>
                    )}
                    <div className="flex justify-between gap-3 border-t border-white/10 pt-2 text-base font-bold">
                        <dt>Total</dt>
                        <dd className="text-amber-300">{naira(total)}</dd>
                    </div>
                </dl>
            </div>
        </div>
    );
}
