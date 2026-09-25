'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { markTaskServiced } from "@/app/admin/actions";
import ConfirmDialog from "@/components/dashboard/ConfirmDialog";
import { todayLagos } from "@/lib/tasks";

const dateText = (value: string) =>
    new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

// Lets an admin mark a pickup serviced themselves, for example when the
// employee did the job but did not tap End. A pickup dated in the future gets
// an extra warning first.
export default function MarkServicedButton({
                                               taskId,
                                               title,
                                               scheduledDate,
                                           }: {
    taskId: string;
    title: string;
    scheduledDate: string | null;
}) {
    const router = useRouter();
    const [asking, setAsking] = useState(false);
    const [busy, setBusy] = useState(false);
    const future = Boolean(scheduledDate) && (scheduledDate as string) > todayLagos();

    const run = async () => {
        setBusy(true);
        const result = await markTaskServiced(taskId, future);
        setBusy(false);
        setAsking(false);

        if (!result.success) {
            toast.error(result.error ?? "Could not mark it serviced.");
            return;
        }

        toast.success(result.message ?? "Marked serviced");
        router.refresh();
    };

    return (
        <>
            <div className="mt-3 flex flex-col gap-2 border-t border-white/10 pt-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-white/50">Done but not marked? You can mark it serviced yourself.</p>
                <button
                    type="button"
                    onClick={() => setAsking(true)}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-4 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/20 sm:h-9 sm:text-xs"
                >
                    <CheckCircle2 className="h-4 w-4" />
                    Mark as serviced
                </button>
            </div>

            <ConfirmDialog
                open={asking}
                title={future ? "This pickup is not due yet" : "Mark this pickup as serviced?"}
                confirmLabel={future ? "Yes, mark it serviced" : "Yes, mark serviced"}
                busy={busy}
                onConfirm={run}
                onCancel={() => setAsking(false)}
            >
                {future ? (
                    <>
                        <p>
                            <span className="font-bold text-white">{title}</span> is scheduled for{" "}
                            <span className="font-bold text-white">{scheduledDate ? dateText(scheduledDate) : "a later date"}</span>, which has not come
                            yet.
                        </p>
                        <p className="mt-2">Only continue if the pickup has really been done. The customer is told it has been serviced.</p>
                    </>
                ) : (
                    <p>
                        <span className="font-bold text-white">{title}</span>
                        {scheduledDate ? ` (${dateText(scheduledDate)})` : ""} is recorded as serviced, and the customer is told. You can revert it
                        later if that was a mistake.
                    </p>
                )}
            </ConfirmDialog>
        </>
    );
}
