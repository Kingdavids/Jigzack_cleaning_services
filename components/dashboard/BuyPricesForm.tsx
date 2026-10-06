'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setBuyPrices } from "@/app/admin/actions/recyclables";
import { MATERIALS, type BuyPrices } from "@/lib/recyclables";

// What we pay per kilogram for each material. Changing a price here changes the
// starting price on the log form; entries already logged keep what was paid.
export default function BuyPricesForm({ prices }: { prices: BuyPrices }) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);

    const submit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (busy) return;

        setBusy(true);
        const result = await setBuyPrices(new FormData(e.currentTarget));
        setBusy(false);

        if (!result.success) {
            toast.error(result.error ?? "Could not save the prices.");
            return;
        }

        toast.success("Buying prices saved");
        router.refresh();
    };

    return (
        <form onSubmit={submit} className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {MATERIALS.filter((m) => m.value !== "other").map((m) => (
                    <div key={m.value}>
                        <label htmlFor={`price-${m.value}`} className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-white/50">
                            {m.label}
                        </label>
                        <input
                            id={`price-${m.value}`}
                            name={`price_${m.value}`}
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.01"
                            defaultValue={prices[m.value] ?? 0}
                            className="h-11 w-full rounded-xl border border-white/10 bg-white/8 px-3 text-sm text-white outline-none focus:border-amber-300/50"
                        />
                    </div>
                ))}
            </div>
            <p className="text-xs text-white/40">Naira per kg, paid to the person we buy from. The &ldquo;Other&rdquo; material has no set price; type one in when you log it.</p>
            <button
                type="submit"
                disabled={busy}
                className="h-11 w-fit rounded-xl bg-amber-400 px-5 text-sm font-bold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
                {busy ? "Saving..." : "Save prices"}
            </button>
        </form>
    );
}
