'use client';

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { markInvoicePaid } from "@/app/admin/actions";

const METHODS = ["Bank transfer", "Cash", "POS", "Other"];

export default function MarkPaidControl({ paymentId }: { paymentId: string }) {
    const [method, setMethod] = useState(METHODS[0]);
    const [reference, setReference] = useState("");
    const [pending, startTransition] = useTransition();

    const handleClick = () => {
        startTransition(async () => {
            await markInvoicePaid(paymentId, method, reference);
            toast.success("Marked as paid. A receipt is now available to the customer.");
        });
    };

    return (
        <div className="mt-3 flex flex-col gap-2 border-t border-white/10 pt-3 sm:flex-row sm:items-center">
            <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="h-9 rounded-lg border border-white/10 bg-[#141518] px-2 text-xs text-white outline-none"
            >
                {METHODS.map((m) => (
                    <option key={m} value={m}>
                        {m}
                    </option>
                ))}
            </select>
            <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Reference (optional)"
                className="h-9 flex-1 rounded-lg border border-white/10 bg-white/8 px-3 text-xs text-white outline-none placeholder:text-white/30"
            />
            <button
                type="button"
                onClick={handleClick}
                disabled={pending}
                className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
                {pending ? "Saving…" : "Mark as paid"}
            </button>
        </div>
    );
}
