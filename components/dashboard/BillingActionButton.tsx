'use client';

import { useTransition } from "react";
import { toast } from "sonner";
import type { GenerateResult } from "@/app/admin/actions";

// Runs a server action that returns { success, message } and reports it. Used
// for the "generate invoices / schedules" buttons so a double click can't
// fire it twice (the generators are idempotent as well).
export default function BillingActionButton({
                                                 run,
                                                 children,
                                                 variant = "primary",
                                             }: {
    run: () => Promise<GenerateResult>;
    children: React.ReactNode;
    variant?: "primary" | "secondary";
}) {
    const [pending, startTransition] = useTransition();

    const handleClick = () => {
        startTransition(async () => {
            const result = await run();
            if (result.success) toast.success(result.message, { duration: 8000 });
            else toast.error(result.message);
        });
    };

    return (
        <button
            type="button"
            onClick={handleClick}
            disabled={pending}
            className={
                variant === "primary"
                    ? "rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-bold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
                    : "rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
            }
        >
            {pending ? "Working…" : children}
        </button>
    );
}
