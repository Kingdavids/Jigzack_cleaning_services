'use client';

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import { deleteTask, updateTask } from "@/app/admin/actions";
import ConfirmDialog from "@/components/dashboard/ConfirmDialog";

const inputClass =
    "h-11 rounded-lg border border-white/10 bg-white/8 px-2.5 text-base text-white outline-none placeholder:text-white/30 focus:border-amber-300/50 sm:h-9 sm:text-xs";

// The schedule controls for a pickup that has not started. Nothing is locked
// until someone is put on it; from then on it stays locked (the date, area and
// people cannot be changed by accident) until an admin unlocks it on purpose.
export default function TaskAdminControls({
                                               taskId,
                                               employeeId,
                                               crewIds,
                                               teamText,
                                               scheduledDate,
                                               zone,
                                               employees,
                                               canUnlock = true,
                                           }: {
    taskId: string;
    employeeId: string | null;
    // The other employees on the job besides the lead.
    crewIds: string[];
    // "Ada and Bola", already worked out on the server.
    teamText: string;
    scheduledDate: string | null;
    zone: string | null;
    employees: { id: string; full_name: string | null }[];
    canUnlock?: boolean;
}) {
    const router = useRouter();
    const assigned = Boolean(employeeId);
    const [unlocked, setUnlocked] = useState(false);
    const [asking, setAsking] = useState<"unlock" | "remove" | null>(null);
    const [employee, setEmployee] = useState(employeeId ?? "");
    const [crew, setCrew] = useState<string[]>(crewIds);
    const [date, setDate] = useState(scheduledDate ?? "");
    const [area, setArea] = useState(zone ?? "");
    const [pending, startTransition] = useTransition();

    const editing = !assigned || unlocked;

    const toggleCrew = (id: string) => setCrew((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));

    const save = () =>
        startTransition(async () => {
            const result = await updateTask(taskId, employee || null, date || null, area, employee ? crew.filter((c) => c !== employee) : [], unlocked);

            if (!result.success) {
                toast.error(result.error ?? "Could not save.");
                return;
            }

            toast.success(result.message ?? "Pickup updated");
            setUnlocked(false);
            router.refresh();
        });

    const remove = () =>
        startTransition(async () => {
            const result = await deleteTask(taskId, unlocked || !assigned);
            setAsking(null);

            if (!result.success) {
                toast.error(result.error ?? "Could not remove it.");
                return;
            }

            toast.success(result.message ?? "Pickup removed");
            router.refresh();
        });

    return (
        <div className="mt-3 border-t border-white/10 pt-3">
            {assigned && !unlocked && (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="flex items-center gap-2 text-sm text-white/70">
                        <Lock className="h-4 w-4 shrink-0 text-emerald-300" />
                        <span>
                            Assigned to <span className="font-semibold text-white">{teamText || "an employee"}</span>. Locked so it can&apos;t be changed by accident.
                        </span>
                    </p>
                    {canUnlock && (
                        <button
                            type="button"
                            onClick={() => setAsking("unlock")}
                            className="h-11 rounded-lg border border-white/15 px-4 text-sm font-semibold text-white/80 transition hover:bg-white/10 sm:h-9 sm:text-xs"
                        >
                            Unlock to change
                        </button>
                    )}
                </div>
            )}

            {editing && (
                <div className="space-y-3">
                    {unlocked && <p className="text-xs font-semibold text-amber-300">Unlocked. Whoever is on it will be told about any change.</p>}

                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                        <select
                            value={employee}
                            onChange={(e) => setEmployee(e.target.value)}
                            aria-label="Lead employee"
                            className={`${inputClass} bg-[#141518] sm:w-48`}
                        >
                            <option value="">Unassigned</option>
                            {employees.map((e) => (
                                <option key={e.id} value={e.id}>
                                    {e.full_name}
                                </option>
                            ))}
                        </select>
                        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" className={`${inputClass} sm:w-40`} />
                        <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Zone" aria-label="Zone" className={`${inputClass} sm:w-36`} />
                    </div>

                    {employee && employees.filter((e) => e.id !== employee).length > 0 && (
                        <fieldset>
                            <legend className="text-xs text-white/50">Also on this task (optional)</legend>
                            <div className="mt-1.5 flex flex-wrap gap-2">
                                {employees
                                    .filter((e) => e.id !== employee)
                                    .map((e) => (
                                        <label
                                            key={e.id}
                                            className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm transition sm:min-h-9 sm:text-xs ${
                                                crew.includes(e.id)
                                                    ? "border-amber-400/50 bg-amber-400/10 text-amber-200"
                                                    : "border-white/10 bg-white/5 text-white/70"
                                            }`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={crew.includes(e.id)}
                                                onChange={() => toggleCrew(e.id)}
                                                className="h-4 w-4 accent-amber-400"
                                            />
                                            {e.full_name}
                                        </label>
                                    ))}
                            </div>
                        </fieldset>
                    )}

                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={save}
                            disabled={pending}
                            className="h-11 rounded-lg bg-amber-400 px-4 text-sm font-bold text-black transition hover:bg-amber-300 disabled:opacity-60 sm:h-9 sm:text-xs"
                        >
                            {pending ? "Saving…" : employee ? "Assign and lock" : "Save"}
                        </button>
                        <button
                            type="button"
                            onClick={() => setAsking("remove")}
                            disabled={pending}
                            className="h-11 rounded-lg border border-red-400/20 bg-red-500/10 px-4 text-sm font-semibold text-red-300 transition hover:bg-red-500/20 disabled:opacity-60 sm:h-9 sm:text-xs"
                        >
                            Remove
                        </button>
                        {unlocked && (
                            <button
                                type="button"
                                onClick={() => {
                                    setUnlocked(false);
                                    setEmployee(employeeId ?? "");
                                    setCrew(crewIds);
                                    setDate(scheduledDate ?? "");
                                    setArea(zone ?? "");
                                }}
                                className="h-11 px-2 text-sm font-semibold text-white/60 underline underline-offset-2 hover:text-white sm:h-9 sm:text-xs"
                            >
                                Cancel
                            </button>
                        )}
                    </div>
                </div>
            )}

            <ConfirmDialog
                open={asking === "unlock"}
                title="Unlock this pickup?"
                confirmLabel="Yes, unlock it"
                onConfirm={() => {
                    setUnlocked(true);
                    setAsking(null);
                }}
                onCancel={() => setAsking(null)}
            >
                <p>
                    It is assigned to {teamText || "an employee"}. Unlocking lets you change the people, the date or the area. They will be told
                    if you do.
                </p>
            </ConfirmDialog>

            <ConfirmDialog
                open={asking === "remove"}
                title="Remove this pickup?"
                confirmLabel="Yes, remove it"
                tone="danger"
                busy={pending}
                onConfirm={remove}
                onCancel={() => setAsking(null)}
            >
                <p>It comes off the schedule for the customer and for {teamText || "the team"}.</p>
            </ConfirmDialog>
        </div>
    );
}
