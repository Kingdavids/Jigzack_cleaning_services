'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Undo2 } from "lucide-react";
import { toast } from "sonner";
import { reopenTask } from "@/app/admin/actions";
import ConfirmDialog from "@/components/dashboard/ConfirmDialog";

// For a pickup an employee marked serviced that was not actually done (or was
// marked serviced because its date passed). It goes back to not done, stays
// open, and the crew and the customer are told.
export default function RevertTaskButton({ taskId, title, dateText }: { taskId: string; title: string; dateText: string }) {
    const router = useRouter();
    const [asking, setAsking] = useState(false);
    const [busy, setBusy] = useState(false);

    const run = async () => {
        setBusy(true);
        const result = await reopenTask(taskId);
        setBusy(false);
        setAsking(false);

        if (!result.success) {
            toast.error(result.error ?? "Could not revert it.");
            return;
        }

        toast.success(result.message ?? "Reverted");
        router.refresh();
    };

    return (
        <>
            <div className="mt-3 flex flex-col gap-2 border-t border-white/10 pt-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-white/50">Marked serviced. If it was not actually done, you can put it back.</p>
                <button
                    type="button"
                    onClick={() => setAsking(true)}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 text-sm font-semibold text-amber-200 transition hover:bg-amber-400/20 sm:h-9 sm:text-xs"
                >
                    <Undo2 className="h-4 w-4" />
                    Revert to not done
                </button>
            </div>

            <ConfirmDialog
                open={asking}
                title="Mark this pickup as not done?"
                confirmLabel="Yes, revert it"
                busy={busy}
                onConfirm={run}
                onCancel={() => setAsking(false)}
            >
                <p>
                    <span className="font-bold text-white">{title}</span> ({dateText}) goes back to not done and stays open, even though its date
                    has passed. The employees on it and the customer are told.
                </p>
            </ConfirmDialog>
        </>
    );
}
