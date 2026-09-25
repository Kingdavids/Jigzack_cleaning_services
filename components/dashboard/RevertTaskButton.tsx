'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { reopenTask } from "@/app/admin/actions";
import ConfirmDialog from "@/components/dashboard/ConfirmDialog";

// A serviced pickup is locked. Unlocking it (on purpose, with a confirmation)
// shows Revert to not done, for a pickup that was marked serviced but was not
// actually done, or was marked serviced because its date passed. Reverting
// keeps it open, and the crew and the customer are told.
export default function RevertTaskButton({ taskId, title, dateText }: { taskId: string; title: string; dateText: string }) {
    const router = useRouter();
    const [unlocked, setUnlocked] = useState(false);
    const [asking, setAsking] = useState<"unlock" | "revert" | null>(null);
    const [busy, setBusy] = useState(false);

    const run = async () => {
        setBusy(true);
        const result = await reopenTask(taskId);
        setBusy(false);
        setAsking(null);

        if (!result.success) {
            toast.error(result.error ?? "Could not revert it.");
            return;
        }

        toast.success(result.message ?? "Reverted");
        setUnlocked(false);
        router.refresh();
    };

    return (
        <>
            <div className="mt-3 border-t border-white/10 pt-3">
                {!unlocked ? (
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="flex items-center gap-2 text-sm text-white/70">
                            <Lock className="h-4 w-4 shrink-0 text-emerald-300" />
                            <span>Serviced. Locked so it can&apos;t be changed by accident.</span>
                        </p>
                        <button
                            type="button"
                            onClick={() => setAsking("unlock")}
                            className="h-11 rounded-lg border border-white/15 px-4 text-sm font-semibold text-white/80 transition hover:bg-white/10 sm:h-9 sm:text-xs"
                        >
                            Unlock to change
                        </button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <p className="text-xs font-semibold text-amber-300">Unlocked. If it was not actually done, you can put it back.</p>
                        <div className="flex flex-wrap items-center gap-3">
                            <button
                                type="button"
                                onClick={() => setAsking("revert")}
                                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 text-sm font-semibold text-amber-200 transition hover:bg-amber-400/20 sm:h-9 sm:text-xs"
                            >
                                <Undo2 className="h-4 w-4" />
                                Revert to not done
                            </button>
                            <button
                                type="button"
                                onClick={() => setUnlocked(false)}
                                className="h-11 px-2 text-sm font-semibold text-white/60 underline underline-offset-2 hover:text-white sm:h-9 sm:text-xs"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <ConfirmDialog
                open={asking === "unlock"}
                title="Unlock this serviced pickup?"
                confirmLabel="Yes, unlock it"
                onConfirm={() => {
                    setUnlocked(true);
                    setAsking(null);
                }}
                onCancel={() => setAsking(null)}
            >
                <p>
                    <span className="font-bold text-white">{title}</span> ({dateText}) is recorded as serviced. Unlocking lets you put it back to not
                    done.
                </p>
            </ConfirmDialog>

            <ConfirmDialog
                open={asking === "revert"}
                title="Mark this pickup as not done?"
                confirmLabel="Yes, revert it"
                busy={busy}
                onConfirm={run}
                onCancel={() => setAsking(null)}
            >
                <p>
                    <span className="font-bold text-white">{title}</span> ({dateText}) goes back to not done and stays open, even though its date
                    may have passed. The employees on it and the customer are told.
                </p>
            </ConfirmDialog>
        </>
    );
}
