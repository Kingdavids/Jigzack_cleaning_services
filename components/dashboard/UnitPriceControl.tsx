'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setUnitPricing } from "@/app/admin/actions/estates";
import { naira } from "@/lib/customer/billing";
import ConfirmDialog from "@/components/dashboard/ConfirmDialog";

const parseAmount = (text: string) => {
    const cleaned = text.replace(/[,\s₦]/g, "");
    return cleaned === "" ? null : /^\d*\.?\d{0,2}$/.test(cleaned) ? Number(cleaned) : NaN;
};

const parseQuantity = (text: string) => {
    const cleaned = text.trim();
    return /^\d+$/.test(cleaned) ? Number(cleaned) : NaN;
};

// One estate unit's type and price, and how many identical units it stands
// for. Blank stays "not priced yet", so it is left out of the estate's total
// until an admin gives it a type, and the estate keeps being billed the old
// way until every one of its units has one.
export default function UnitPriceControl({
                                             unitId,
                                             label,
                                             propertyType,
                                             standardPrices,
                                             monthlyRate,
                                             isVacant,
                                             quantity = 1,
                                         }: {
    unitId: string;
    label: string;
    propertyType: string | null;
    // key -> label -> standard price, so the summary and the dropdown agree.
    standardPrices: { key: string; label: string; price: number }[];
    monthlyRate: number | null;
    isVacant: boolean;
    // How many identical units this row bills for, e.g. a whole block of duplexes in one row.
    quantity?: number;
}) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [type, setType] = useState(propertyType ?? "");
    const [rate, setRate] = useState(monthlyRate ? String(monthlyRate) : "");
    const [qty, setQty] = useState(String(quantity || 1));
    const [vacant, setVacant] = useState(isVacant);
    const [confirming, setConfirming] = useState(false);
    const [busy, setBusy] = useState(false);

    const chosen = standardPrices.find((f) => f.key === type) ?? null;
    const parsedRate = parseAmount(rate);
    const rateValid = parsedRate === null || (Number.isFinite(parsedRate) && parsedRate > 0);
    const parsedQty = parseQuantity(qty);
    const qtyValid = Number.isFinite(parsedQty) && parsedQty >= 1;
    const valid = vacant ? qtyValid : Boolean(type) && rateValid && qtyValid;

    const effectivePrice = chosen ? (parsedRate && parsedRate > 0 ? parsedRate : chosen.price) : null;
    const effectiveTotal = effectivePrice !== null ? effectivePrice * (qtyValid ? parsedQty : 1) : null;

    const save = async () => {
        setBusy(true);
        const result = await setUnitPricing(
            unitId,
            vacant ? propertyType : type || null,
            vacant ? null : parsedRate || null,
            vacant,
            qtyValid ? parsedQty : 1
        );
        setBusy(false);
        setConfirming(false);

        if (!result.success) {
            toast.error(result.error ?? "Could not save.");
            return;
        }

        toast.success(result.message ?? "Saved");
        setOpen(false);
        router.refresh();
    };

    if (!open) {
        const current = standardPrices.find((f) => f.key === propertyType);
        const shownRate = monthlyRate && monthlyRate !== current?.price ? monthlyRate : current?.price ?? 0;

        return (
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="flex w-full items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-left text-sm transition hover:border-white/25"
            >
                <span className="flex-1 text-white/80">
                    {label}
                    {quantity > 1 && <span className="ml-1 text-white/40">({quantity} units)</span>}
                </span>
                {isVacant ? (
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white/50">Vacant</span>
                ) : current ? (
                    <span className="text-xs text-emerald-300">
                        {quantity > 1 ? `${quantity} × ` : ""}
                        {current.label} · {naira(shownRate)}
                        {monthlyRate && monthlyRate !== current.price ? " (custom)" : ""}
                        {quantity > 1 ? ` each = ${naira(shownRate * quantity)}` : ""}
                    </span>
                ) : (
                    <span className="text-xs font-semibold text-amber-300">Not priced yet</span>
                )}
            </button>
        );
    }

    return (
        <div className="space-y-2 rounded-lg border border-white/10 bg-black/25 p-3">
            <p className="text-sm font-semibold text-white/80">{label}</p>

            <label className="flex cursor-pointer items-center gap-2 text-sm text-white/70">
                <input type="checkbox" checked={vacant} onChange={(e) => setVacant(e.target.checked)} className="h-4 w-4 accent-amber-400" />
                Vacant (not billed)
            </label>

            {!vacant && (
                <>
                    <select
                        value={type}
                        onChange={(e) => setType(e.target.value)}
                        aria-label="Property type"
                        className="h-10 w-full rounded-lg border border-white/10 bg-[#141518] px-3 text-sm text-white outline-none"
                    >
                        <option value="">Not priced yet</option>
                        {standardPrices.map((f) => (
                            <option key={f.key} value={f.key}>
                                {f.label} ({naira(f.price)})
                            </option>
                        ))}
                    </select>

                    {type && (
                        <input
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            value={rate}
                            onChange={(e) => setRate(e.target.value)}
                            placeholder={`Custom price (optional, standard is ${naira(chosen?.price ?? 0)})`}
                            className="h-10 w-full rounded-lg border border-white/10 bg-white/8 px-3 text-sm text-white outline-none placeholder:text-white/30"
                        />
                    )}
                </>
            )}

            <label className="block text-xs text-white/50">
                Number of identical units this row bills for
                <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    placeholder="1"
                    className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-white/8 px-3 text-sm text-white outline-none placeholder:text-white/30"
                />
            </label>

            <div className="flex gap-2">
                <button
                    type="button"
                    disabled={!valid}
                    onClick={() => setConfirming(true)}
                    className="rounded-lg bg-amber-400 px-4 py-2 text-xs font-bold text-black hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    Save
                </button>
                <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-lg border border-white/15 px-4 py-2 text-xs font-semibold text-white/80 hover:bg-white/10"
                >
                    Cancel
                </button>
            </div>

            <ConfirmDialog
                open={confirming}
                title={vacant ? "Mark this unit vacant?" : "Save this unit's price?"}
                confirmLabel="Yes, save it"
                busy={busy}
                onConfirm={save}
                onCancel={() => setConfirming(false)}
            >
                {vacant ? (
                    <p>{label} is left out of this estate&apos;s monthly total while it is vacant.</p>
                ) : qtyValid && parsedQty > 1 ? (
                    <p>
                        {label} is billed as <span className="font-bold text-white">{parsedQty}</span> ×{" "}
                        <span className="font-bold text-white">{chosen?.label}</span> at{" "}
                        <span className="font-bold text-white">{naira(effectivePrice ?? 0)}</span> each, a total of{" "}
                        <span className="font-bold text-white">{naira(effectiveTotal ?? 0)}</span> a month. This month&apos;s open invoice is
                        updated if it hasn&apos;t been touched yet.
                    </p>
                ) : (
                    <p>
                        {label} is billed as a <span className="font-bold text-white">{chosen?.label}</span> at{" "}
                        <span className="font-bold text-white">{naira(effectivePrice ?? 0)}</span> a month. This month&apos;s open invoice is
                        updated if it hasn&apos;t been touched yet.
                    </p>
                )}
            </ConfirmDialog>
        </div>
    );
}
