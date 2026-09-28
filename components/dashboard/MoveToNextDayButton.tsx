'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { toast } from "sonner";
import ConfirmDialog from "@/components/dashboard/ConfirmDialog";
import { nextPickupDay, type MoveTaskResult } from "@/lib/tasks";

const dateText = (value: string) =>
    new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

const weekday = (value: string) => new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });

// Pushes a pickup that has not started to the next day, after a confirmation
// that says which day it lands on. Used by admins and by the people on the job.
export default function MoveToNextDayButton({
                                                taskId,
                                                title,
                                                scheduledDate,
                                                action,
                                                className,
                                            }: {
    taskId: string;
    title: string;
    scheduledDate: string;
    action: (taskId: string) => Promise<MoveTaskResult>;
    className?: string;
}) {
    const router = useRouter();
    const [asking, setAsking] = useState(false);
    const [busy, setBusy] = useState(false);

    const next = nextPickupDay(scheduledDate);

    const run = async () => {
        setBusy(true);
        const result = await action(taskId);
        setBusy(false);
        setAsking(false);

        if (!result.success) {
            toast.error(result.error ?? "Could not move it.");
            return;
        }

        toast.success(result.message ?? "Moved to the next day");
        router.refresh();
    };

    return (
        <>
            <button
                type="button"
                onClick={() => setAsking(true)}
                disabled={busy}
                className={
                    className ??
                    "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-sky-400/30 bg-sky-400/10 px-4 text-sm font-semibold text-sky-200 transition hover:bg-sky-400/20 disabled:cursor-not-allowed disabled:opacity-50"
                }
            >
                <CalendarClock className="h-4 w-4" />
                Move to next day
            </button>

            <ConfirmDialog
                open={asking}
                title="Move this pickup to the next day?"
                confirmLabel={`Yes, move to ${weekday(next)}`}
                busy={busy}
                onConfirm={run}
                onCancel={() => setAsking(false)}
            >
                <p>
                    <span className="font-bold text-white">{title}</span> moves from {dateText(scheduledDate)} to{" "}
                    <span className="font-bold text-white">{dateText(next)}</span>.
                </p>
                <p className="mt-2">The customer and the lead employee are told about the new date.</p>
            </ConfirmDialog>
        </>
    );
}
