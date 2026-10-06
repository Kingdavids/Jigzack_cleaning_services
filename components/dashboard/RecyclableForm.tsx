'use client';

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { logRecyclable } from "@/app/admin/actions/recyclables";
import { MATERIALS, type BuyPrices } from "@/lib/recyclables";
import { naira } from "@/lib/customer/billing";

const fieldClass =
    "h-11 w-full rounded-xl border border-white/10 bg-white/8 px-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-amber-300/50";
const labelClass = "mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-white/50";

// Log recyclable waste coming in (collected) or going out (sold or dispatched), by weight.
export default function RecyclableForm({ today, prices }: { today: string; prices: BuyPrices }) {
    const router = useRouter();
    const formRef = useRef<HTMLFormElement>(null);
    const [direction, setDirection] = useState<"in" | "out">("in");
    const [material, setMaterial] = useState("plastic");
    const [kg, setKg] = useState("");
    // The price per kg follows the material until the admin types a different one.
    const [typedPrice, setTypedPrice] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const price = typedPrice ?? String(prices[material] ?? 0);
    const cost = Math.round(Number(kg) * Number(price) * 100) / 100;

    const submit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (busy) return;

        setBusy(true);
        const result = await logRecyclable(new FormData(e.currentTarget));
        setBusy(false);

        if (!result.success) {
            toast.error(result.error ?? "Could not save this.");
            return;
        }

        toast.success(direction === "in" ? "Recyclables logged as collected" : "Recyclables logged as sold or dispatched");
        formRef.current?.reset();
        setMaterial("plastic");
        setKg("");
        setTypedPrice(null);
        router.refresh();
    };

    return (
        <form ref={formRef} onSubmit={submit} className="grid gap-3">
            <input type="hidden" name="direction" value={direction} />

            <div role="group" aria-label="Direction" className="grid grid-cols-2 gap-2">
                {([
                    { value: "in", label: "Came in", hint: "Collected or received" },
                    { value: "out", label: "Went out", hint: "Sold or dispatched" },
                ] as const).map((d) => (
                    <button
                        key={d.value}
                        type="button"
                        onClick={() => setDirection(d.value)}
                        aria-pressed={direction === d.value}
                        className={`rounded-xl border px-4 py-3 text-left transition ${
                            direction === d.value
                                ? d.value === "in"
                                    ? "border-emerald-400 bg-emerald-400/15"
                                    : "border-red-400 bg-red-400/15"
                                : "border-white/10 bg-white/5 hover:bg-white/10"
                        }`}
                    >
                        <p className="font-bold">{d.label}</p>
                        <p className="text-xs text-white/50">{d.hint}</p>
                    </button>
                ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
                <div>
                    <label htmlFor="rc-material" className={labelClass}>
                        Material
                    </label>
                    <select
                        id="rc-material"
                        name="material"
                        value={material}
                        onChange={(e) => {
                            setMaterial(e.target.value);
                            setTypedPrice(null);
                        }}
                        className={`${fieldClass} bg-[#141518]`}
                    >
                        {MATERIALS.map((m) => (
                            <option key={m.value} value={m.value}>
                                {m.label}
                            </option>
                        ))}
                    </select>
                </div>
                <div>
                    <label htmlFor="rc-kg" className={labelClass}>
                        Weight (kg)
                    </label>
                    <input id="rc-kg" name="kg" type="number" inputMode="decimal" min="0.01" step="0.01" required value={kg} onChange={(e) => setKg(e.target.value)} placeholder="e.g. 250" className={fieldClass} />
                </div>
                <div>
                    <label htmlFor="rc-date" className={labelClass}>
                        Date
                    </label>
                    <input id="rc-date" name="date" type="date" required defaultValue={today} max={today} className={fieldClass} />
                </div>
            </div>

            {material === "other" && (
                <div>
                    <label htmlFor="rc-other" className={labelClass}>
                        What is it?
                    </label>
                    <input id="rc-other" name="materialNote" maxLength={80} required placeholder="e.g. Used tyres" className={fieldClass} />
                </div>
            )}

            {direction === "in" ? (
                <div>
                    <label htmlFor="rc-price" className={labelClass}>
                        Price we pay per kg (₦)
                    </label>
                    <input
                        id="rc-price"
                        name="pricePerKg"
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        value={price}
                        onChange={(e) => setTypedPrice(e.target.value)}
                        placeholder="0 if it cost nothing"
                        className={fieldClass}
                    />
                    <p className="mt-1 text-xs text-white/40">
                        {cost > 0 ? `${naira(cost)} to pay. ` : ""}It starts from the buying price for this material and can be changed here for this entry. Counts as money out on Money in &amp; out, under
                        recyclables purchases.
                    </p>
                </div>
            ) : (
                <p className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/55">
                    To sell to a buyer and be paid, make an invoice instead: Payments → Create a one-off invoice → Sale of recyclables. That takes the weight out of stock and
                    brings the payment in. Use this for recyclables dispatched without a sale.
                </p>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
                <div>
                    <label htmlFor="rc-party" className={labelClass}>
                        {direction === "in" ? "Where from (optional)" : "Who took it (optional)"}
                    </label>
                    <input
                        id="rc-party"
                        name="party"
                        maxLength={120}
                        placeholder={direction === "in" ? "e.g. Ikeja route, Grace Hotel" : "e.g. the buyer's name"}
                        className={fieldClass}
                    />
                </div>
                <div>
                    <label htmlFor="rc-note" className={labelClass}>
                        Note (optional)
                    </label>
                    <input id="rc-note" name="note" maxLength={300} className={fieldClass} />
                </div>
            </div>

            <button
                type="submit"
                disabled={busy}
                className="h-11 rounded-xl bg-amber-400 px-5 text-sm font-bold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
                {busy ? "Saving..." : direction === "in" ? "Log as collected" : "Log as sold or dispatched"}
            </button>
        </form>
    );
}
