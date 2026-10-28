'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { generateUnregisteredInvoices } from "@/app/admin/actions/unregistered";

// Makes this month's invoice for everyone on the list who doesn't have it yet.
export default function UnregisteredGenerateAll({ month, waiting }: { month: string; waiting: number }) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);

    const generate = async () => {
        if (!window.confirm(`Generate the ${month} invoice for the ${waiting} ${waiting === 1 ? "person" : "people"} who ${waiting === 1 ? "doesn't" : "don't"} have one yet?`)) return;

        setBusy(true);
        const result = await generateUnregisteredInvoices();
        setBusy(false);

        if (!result.success) {
            toast.error(result.error ?? "Something went wrong.");
            return;
        }

        toast.success(result.message ?? "Invoices generated");
        router.refresh();
    };

    return (
        <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
                type="button"
                disabled={busy || waiting === 0}
                onClick={generate}
                className="rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-bold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
                {busy ? "Generating…" : `Generate ${month} invoices`}
            </button>
            <p className="text-xs text-white/50">
                {waiting === 0
                    ? `Everyone billed already has their ${month} invoice.`
                    : `${waiting} still ${waiting === 1 ? "has" : "have"} no ${month} invoice. From the next 25th, the monthly job does this.`}
            </p>
        </div>
    );
}
