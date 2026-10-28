'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteUnregisteredCustomer, setUnregisteredPaused } from "@/app/admin/actions/unregistered";

// Pause or resume a person's monthly billing, or take them off the list.
export default function UnregisteredRowActions({ id, name, paused }: { id: string; name: string; paused: boolean }) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);

    const run = async (work: () => Promise<{ success: boolean; error?: string }>, done: string) => {
        setBusy(true);
        const result = await work();
        setBusy(false);

        if (!result.success) {
            toast.error(result.error ?? "Something went wrong.");
            return;
        }

        toast.success(done);
        router.refresh();
    };

    return (
        <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-white/70">
                <input
                    type="checkbox"
                    role="switch"
                    checked={paused}
                    disabled={busy}
                    onChange={(e) =>
                        run(() => setUnregisteredPaused(id, e.target.checked), e.target.checked ? "Monthly billing paused" : "Monthly billing resumed")
                    }
                    className="h-4 w-4 accent-amber-400"
                />
                Pause monthly billing
            </label>

            <button
                type="button"
                disabled={busy}
                onClick={() => {
                    if (!window.confirm(`Remove ${name} from the list? Invoices already made for them stay. They just won't be billed again automatically.`)) return;
                    run(() => deleteUnregisteredCustomer(id), "Removed from the list");
                }}
                className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-300 hover:bg-red-500/20 disabled:opacity-50"
            >
                Remove
            </button>
        </div>
    );
}
