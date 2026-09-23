'use client';

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteTask, updateTask } from "@/app/admin/actions";

const inputClass =
    "h-9 rounded-lg border border-white/10 bg-white/8 px-2.5 text-xs text-white outline-none placeholder:text-white/30 focus:border-amber-300/50";

export default function TaskAdminControls({
                                               taskId,
                                               employeeId,
                                               scheduledDate,
                                               zone,
                                               employees,
                                           }: {
    taskId: string;
    employeeId: string | null;
    scheduledDate: string | null;
    zone: string | null;
    employees: { id: string; full_name: string | null }[];
}) {
    const [employee, setEmployee] = useState(employeeId ?? "");
    const [date, setDate] = useState(scheduledDate ?? "");
    const [area, setArea] = useState(zone ?? "");
    const [pending, startTransition] = useTransition();

    const save = () =>
        startTransition(async () => {
            await updateTask(taskId, employee || null, date || null, area);
            toast.success("Pickup updated");
        });

    const remove = () => {
        if (!confirm("Remove this pickup from the schedule?")) return;

        startTransition(async () => {
            await deleteTask(taskId);
            toast.success("Pickup removed");
        });
    };

    return (
        <div className="mt-3 flex flex-col gap-2 border-t border-white/10 pt-3 sm:flex-row sm:flex-wrap sm:items-center">
            <select
                value={employee}
                onChange={(e) => setEmployee(e.target.value)}
                aria-label="Assigned employee"
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
            <div className="flex gap-2">
                <button
                    type="button"
                    onClick={save}
                    disabled={pending}
                    className="rounded-lg bg-amber-400 px-3 py-2 text-xs font-bold text-black transition hover:bg-amber-300 disabled:opacity-60"
                >
                    {pending ? "Saving…" : "Save"}
                </button>
                <button
                    type="button"
                    onClick={remove}
                    disabled={pending}
                    className="rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300 transition hover:bg-red-500/20 disabled:opacity-60"
                >
                    Remove
                </button>
            </div>
        </div>
    );
}
