'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteUnregisteredCustomer, generateUnregisteredInvoice, setUnregisteredPaused } from "@/app/admin/actions/unregistered";

type Result = { success: boolean; error?: string; message?: string };

const buttonClass =
    "rounded-lg border px-3 py-1.5 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50";

// Generate this month's invoice, pause or resume a person's monthly billing, or
// take them off the list. Each asks first.
export default function UnregisteredRowActions({
    id,
    name,
    paused,
    month,
    invoiced,
}: {
    id: string;
    name: string;
    paused: boolean;
    // The month the next invoice is for, and whether they already have it.
    month: string;
    invoiced: boolean;
}) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);

    const run = async (work: () => Promise<Result>, done: string) => {
        setBusy(true);
        const result = await work();
        setBusy(false);

        if (!result.success) {
            toast.error(result.error ?? "Something went wrong.");
            return;
        }

        toast.success(result.message ?? done);
        router.refresh();
    };

    const generate = () => {
        if (!window.confirm(`Generate the ${month} invoice for ${name} now?`)) return;
        run(() => generateUnregisteredInvoice(id), `${month} invoice created`);
    };

    const togglePause = () => {
        const question = paused
            ? `Resume monthly billing for ${name}? They will be invoiced again on the next 25th.`
            : `Pause monthly billing for ${name}? No invoice will be made for them on the 25th until you resume it.`;

        if (!window.confirm(question)) return;
        run(() => setUnregisteredPaused(id, !paused), paused ? "Monthly billing resumed" : "Monthly billing paused");
    };

    const remove = () => {
        if (!window.confirm(`Remove ${name} from the list? Invoices already made for them stay. They just won't be billed again automatically.`)) return;
        run(() => deleteUnregisteredCustomer(id), "Removed from the list");
    };

    return (
        <div className="flex flex-wrap items-center gap-2">
            {invoiced ? (
                <span className="rounded-lg bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-300">Invoiced for {month}</span>
            ) : (
                <button
                    type="button"
                    disabled={busy || paused}
                    onClick={generate}
                    title={paused ? "Resume monthly billing first" : undefined}
                    className={`${buttonClass} border-amber-300/40 bg-amber-400/10 text-amber-200 hover:bg-amber-400/20`}
                >
                    Generate {month} invoice
                </button>
            )}

            <button
                type="button"
                disabled={busy}
                onClick={togglePause}
                className={`${buttonClass} border-white/15 bg-white/5 text-white/80 hover:bg-white/10`}
            >
                {paused ? "Resume monthly billing" : "Pause monthly billing"}
            </button>

            <button
                type="button"
                disabled={busy}
                onClick={remove}
                className={`${buttonClass} border-red-400/30 bg-red-500/10 text-red-300 hover:bg-red-500/20`}
            >
                Remove
            </button>
        </div>
    );
}
