'use client';

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ALL_FACILITIES, COMMERCIAL_FACILITIES, DOMESTIC_FACILITIES, type FacilityDef } from "@/lib/customer/facilities";
import { itemsTotal, monthRangeLabel, monthsFrom, UNIT_PRICES, type LineItem } from "@/lib/billing/pricing";
import MonthRangePicker, { monthSpan } from "@/components/dashboard/MonthRangePicker";
import DiscountFields from "@/components/dashboard/DiscountFields";
import { applyDiscount, NO_DISCOUNT, type DiscountInput } from "@/lib/billing/discount-line";

const inputClass =
    "h-11 w-full rounded-xl border border-white/10 bg-white/8 px-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-amber-300/50";

const labelClass = "mb-1 block text-[11px] uppercase tracking-[0.12em] text-white/40";

const naira = (value: number) => `₦${value.toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;

// An extra charge on a hand-made invoice, charged once or for every month covered.
type OtherCharge = LineItem & { monthly: boolean };

// A commercial property that isn't one of the listed types (a church, a filling
// station), with its own name, how many and the agreed price a month.
type OtherSite = { name: string; count: number; price: number };

// The money part of a hand-made invoice: the property's units at their monthly
// price (residential at the standard rates, commercial at whatever price was
// agreed for the site), how many months it covers, any other charges, a
// discount and arrears, with the total worked out as it is filled in. It submits as hidden fields alongside
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
    const [others, setOthers] = useState<OtherCharge[]>([]);
    const [otherSites, setOtherSites] = useState<OtherSite[]>([]);
    const [arrears, setArrears] = useState(0);
    const [discount, setDiscount] = useState<DiscountInput>(NO_DISCOUNT);

    const months = useMemo(() => monthsFrom(range.start, monthSpan(range.start, range.end)), [range]);
    const period = monthRangeLabel(months);
    const n = months.length || 1;

    const forMonths = (label: string) => (n > 1 ? `${label} (${n} months)` : label);
    const perMonthNote = (price: number) => (n > 1 ? `${naira(price)} a month` : undefined);

    const unitLines: LineItem[] = ALL_FACILITIES.filter((f) => (counts[f.key] ?? 0) > 0).map((f) => ({
        label: forMonths(f.unitLabel),
        quantity: counts[f.key],
        unit_price: (prices[f.key] ?? 0) * n,
        note: perMonthNote(prices[f.key] ?? 0),
    }));

    const filledSites = otherSites.filter((site) => site.name.trim() && site.count > 0);
    const siteLines: LineItem[] = filledSites.map((site) => ({
        label: forMonths(site.name.trim()),
        quantity: site.count,
        unit_price: site.price * n,
        note: perMonthNote(site.price),
    }));

    const filledOthers = others.filter((o) => o.label && o.quantity > 0);
    const otherLines: LineItem[] = filledOthers.map(({ monthly, ...item }) =>
        monthly ? { ...item, label: forMonths(item.label), unit_price: item.unit_price * n, note: item.note || perMonthNote(item.unit_price) } : item
    );

    // A commercial site counted but not yet given its agreed price.
    const unpriced = [
        ...COMMERCIAL_FACILITIES.filter((f) => (counts[f.key] ?? 0) > 0 && !(prices[f.key] > 0)).map((f) => f.label.toLowerCase()),
        ...filledSites.filter((site) => !(site.price > 0)).map((site) => site.name.trim()),
    ];

    const monthly =
        ALL_FACILITIES.reduce((sum, f) => sum + (counts[f.key] ?? 0) * (prices[f.key] ?? 0), 0) +
        filledSites.reduce((sum, site) => sum + site.count * site.price, 0) +
        itemsTotal(filledOthers.filter((o) => o.monthly));
    const othersTotal = itemsTotal(filledOthers.filter((o) => !o.monthly));
    // The discount comes off the charges (units for the months, plus other charges), never off arrears.
    const charges = monthly * n + othersTotal;
    const { amount: discountAmount, percent: discountPercent, line: discountLine } = applyDiscount(charges, discount);
    const total = charges - discountAmount + arrears;

    const lineItems = [...unitLines, ...siteLines, ...otherLines, ...(discountLine ? [discountLine] : [])];
    const propertyDetails: Record<string, string> = Object.fromEntries(
        Object.entries(counts).filter(([, c]) => c > 0).map(([k, c]) => [k, String(c)])
    );
    // Shown under "Property" on the invoice, the same field the sign-up form uses.
    if (filledSites.length > 0) propertyDetails.commercialOthers = filledSites.map((site) => `${site.name.trim()} ${site.count}`).join(", ");

    const updateSite = (index: number, patch: Partial<OtherSite>) =>
        setOtherSites((prev) => prev.map((site, i) => (i === index ? { ...site, ...patch } : site)));

    const updateOther = (index: number, patch: Partial<OtherCharge>) =>
        setOthers((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));

    const unitCard = (f: FacilityDef, agreed: boolean) => (
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
                    <span className={labelClass}>{agreed ? "Agreed ₦ a month" : "₦ a month"}</span>
                    <input
                        type="number"
                        min="0"
                        inputMode="decimal"
                        value={agreed ? prices[f.key] || "" : prices[f.key] ?? 0}
                        placeholder={agreed ? "Price" : undefined}
                        onChange={(e) => setPrices((prev) => ({ ...prev, [f.key]: Math.max(0, Number(e.target.value) || 0) }))}
                        className={inputClass}
                    />
                </label>
            </div>
        </div>
    );

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
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-white/45">Residential</p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {DOMESTIC_FACILITIES.map((f) => unitCard(f, false))}
                </div>

                <details
                    open={COMMERCIAL_FACILITIES.some((f) => (counts[f.key] ?? 0) > 0) || otherSites.length > 0}
                    className="group rounded-xl border border-white/10"
                >
                    <summary className="cursor-pointer list-none p-3 text-xs font-semibold uppercase tracking-[0.15em] text-white/45 [&::-webkit-details-marker]:hidden">
                        Commercial <span className="normal-case tracking-normal text-white/35">· price agreed for each site</span>
                    </summary>
                    <div className="grid gap-3 border-t border-white/10 p-3 sm:grid-cols-2 lg:grid-cols-3">
                        {COMMERCIAL_FACILITIES.map((f) => unitCard(f, true))}
                    </div>

                    <div className="space-y-2 border-t border-white/10 p-3">
                        <p className="text-sm font-semibold">Others</p>
                        <p className="text-xs text-white/40">Any other kind of site, such as a church or a filling station.</p>
                        {otherSites.map((site, index) => (
                            <div key={index} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_7rem_10rem_44px]">
                                <input
                                    value={site.name}
                                    onChange={(e) => updateSite(index, { name: e.target.value.slice(0, 60) })}
                                    placeholder="Type of site, e.g. Church"
                                    aria-label="Type of site"
                                    className={`${inputClass} col-span-2 sm:col-span-1`}
                                />
                                <input
                                    type="number"
                                    min="0"
                                    inputMode="numeric"
                                    value={site.count}
                                    onChange={(e) => updateSite(index, { count: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                                    aria-label="How many"
                                    className={inputClass}
                                />
                                <input
                                    type="number"
                                    min="0"
                                    inputMode="decimal"
                                    value={site.price || ""}
                                    onChange={(e) => updateSite(index, { price: Math.max(0, Number(e.target.value) || 0) })}
                                    placeholder="Agreed ₦ a month"
                                    aria-label="Agreed price a month"
                                    className={inputClass}
                                />
                                <button
                                    type="button"
                                    onClick={() => setOtherSites((prev) => prev.filter((_, i) => i !== index))}
                                    aria-label="Remove site"
                                    className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 text-white/50 transition hover:text-red-300"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                        ))}
                        <button
                            type="button"
                            onClick={() => setOtherSites((prev) => [...prev, { name: "", count: 1, price: 0 }])}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/10"
                        >
                            <Plus className="h-3.5 w-3.5" />
                            Add another type of site
                        </button>
                    </div>
                </details>

                {unpriced.length > 0 && (
                    <p className="rounded-xl border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-xs text-amber-200">
                        Enter the agreed monthly price for {unpriced.join(", ")}.
                    </p>
                )}
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
                <p className="text-xs text-white/40">Anything else: an extra pickup, a site with a single agreed fee. Tick &quot;Each month&quot; to charge it for every month covered.</p>
                {others.map((item, index) => (
                    <div key={index} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_80px_130px_1fr_auto_44px] sm:items-center">
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
                            aria-label="Price"
                            className={inputClass}
                        />
                        <input
                            value={item.note ?? ""}
                            onChange={(e) => updateOther(index, { note: e.target.value })}
                            placeholder="Note (optional)"
                            aria-label="Note"
                            className={`${inputClass} col-span-2 sm:col-span-1`}
                        />
                        <label className="flex h-11 cursor-pointer items-center gap-2 whitespace-nowrap text-xs text-white/70">
                            <input
                                type="checkbox"
                                checked={item.monthly}
                                onChange={(e) => updateOther(index, { monthly: e.target.checked })}
                                className="h-4 w-4 accent-amber-400"
                            />
                            Each month
                        </label>
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
                    onClick={() => setOthers((prev) => [...prev, { label: "", quantity: 1, unit_price: 0, monthly: false }])}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/10"
                >
                    <Plus className="h-3.5 w-3.5" />
                    Add a charge
                </button>
            </fieldset>

            <DiscountFields value={discount} onChange={setDiscount} charges={charges} inputClass={inputClass} />

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
                    {discountAmount > 0 && (
                        <div className="flex justify-between gap-3">
                            <dt className="text-white/60">Discount ({discountPercent}%)</dt>
                            <dd className="text-emerald-300">−{naira(discountAmount)}</dd>
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
