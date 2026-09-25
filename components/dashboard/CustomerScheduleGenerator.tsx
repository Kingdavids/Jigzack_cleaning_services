'use client';

import { useState } from "react";
import { toast } from "sonner";
import { generateCustomerBilling } from "@/app/admin/actions";

// Sets up pickups for one customer at a time, from the frequency on their record.
export default function CustomerScheduleGenerator({ customers }: { customers: { id: string; full_name: string | null }[] }) {
    const [customerId, setCustomerId] = useState("");
    const [busy, setBusy] = useState(false);

    const run = async () => {
        if (!customerId) return;

        setBusy(true);
        const result = await generateCustomerBilling(customerId, "schedule");
        setBusy(false);

        if (result.success) toast.success(result.message);
        else toast.error(result.message);
    };

    return (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                aria-label="Customer"
                className="h-11 w-full rounded-xl border border-white/10 bg-[#141518] px-3 text-sm text-white outline-none sm:w-72"
            >
                <option value="">Choose a customer</option>
                {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                        {c.full_name ?? "Unnamed customer"}
                    </option>
                ))}
            </select>
            <button
                type="button"
                disabled={busy || !customerId}
                onClick={run}
                className="rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-bold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
                {busy ? "Generating…" : "Generate schedule"}
            </button>
        </div>
    );
}
