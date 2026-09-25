'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { endTask, startTask, type TaskServiceResult } from "@/app/employee/actions";
import ConfirmDialog from "@/components/dashboard/ConfirmDialog";
import { todayLagos } from "@/lib/tasks";

const dateText = (value: string) =>
    new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

// Start and End for one task. A pickup dated in the future is not due yet, so
// starting or finishing it asks first.
export default function TaskServiceButtons({
                                               taskId,
                                               status,
                                               scheduledDate,
                                           }: {
    taskId: string;
    status: string | null;
    scheduledDate: string | null;
}) {
    const router = useRouter();
    const [asking, setAsking] = useState<"start" | "end" | null>(null);
    const [busy, setBusy] = useState(false);

    const current = (status ?? "").toLowerCase();
    const future = Boolean(scheduledDate) && (scheduledDate as string) > todayLagos();

    const run = async (kind: "start" | "end", confirmed: boolean) => {
        const data = new FormData();
        data.set("taskId", taskId);
        if (confirmed) data.set("confirmEarly", "yes");

        setBusy(true);
        const result: TaskServiceResult = kind === "start" ? await startTask(data) : await endTask(data);
        setBusy(false);
        setAsking(null);

        if (!result.success) {
            toast.error(result.error ?? "Something went wrong.");
            return;
        }

        toast.success(kind === "start" ? "Task started" : "Task marked serviced");
        router.refresh();
    };

    const press = (kind: "start" | "end") => {
        if (future) setAsking(kind);
        else void run(kind, false);
    };

    return (
        <>
            <div className="flex items-center gap-3">
                <button
                    type="button"
                    onClick={() => press("start")}
                    disabled={busy || ["in progress", "completed"].includes(current)}
                    className="h-11 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    Start Task
                </button>
                <button
                    type="button"
                    onClick={() => press("end")}
                    disabled={busy || current === "completed"}
                    className="h-11 rounded-xl bg-amber-400 px-4 text-sm font-bold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    End Task
                </button>
            </div>

            <ConfirmDialog
                open={asking !== null}
                title="This pickup is not due yet"
                confirmLabel={asking === "start" ? "Yes, start it early" : "Yes, mark it serviced"}
                busy={busy}
                onConfirm={() => asking && void run(asking, true)}
                onCancel={() => setAsking(null)}
            >
                <p>
                    It is scheduled for <span className="font-bold text-white">{scheduledDate ? dateText(scheduledDate) : "a later date"}</span>, which has
                    not come yet.
                </p>
                <p className="mt-2">
                    {asking === "end"
                        ? "Marking it serviced now tells the customer and the admin it has been done."
                        : "Starting it now tells the customer and the admin the pickup is under way."}{" "}
                    Only continue if you really are doing it today.
                </p>
            </ConfirmDialog>
        </>
    );
}
