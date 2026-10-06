'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { assignTasks } from "@/app/admin/actions/tasks";
import { useBulkSelection } from "@/components/dashboard/BulkSelect";
import ConfirmDialog from "@/components/dashboard/ConfirmDialog";

// Gives every ticked pickup to one employee at once. It sits under the
// Select all bar of the task list. Only pickups with nobody on them are changed.
export default function BulkAssignBar({ employees, unassignedIds }: { employees: { id: string; full_name: string | null }[]; unassignedIds: string[] }) {
    const router = useRouter();
    const bulk = useBulkSelection();
    const [employee, setEmployee] = useState("");
    const [crew, setCrew] = useState<string[]>([]);
    const [asking, setAsking] = useState(false);
    const [busy, setBusy] = useState(false);

    if (!bulk) return null;

    const count = bulk.selected.size;
    const lead = employees.find((e) => e.id === employee);
    const others = employees.filter((e) => e.id !== employee);
    const crewOf = crew.filter((id) => id !== employee);

    const run = async () => {
        setBusy(true);
        const result = await assignTasks([...bulk.selected], employee, crewOf);
        setBusy(false);
        setAsking(false);

        if (!result.success) {
            toast.error(result.error ?? "Could not assign them.");
            return;
        }

        toast.success(result.message ?? "Assigned");
        bulk.clear();
        setCrew([]);
        router.refresh();
    };

    return (
        <div className="mb-3 space-y-3 rounded-xl border border-white/10 bg-black/20 px-3 py-3">
            <div className="flex flex-wrap items-center gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/50">Assign in bulk</p>
                <button
                    type="button"
                    disabled={unassignedIds.length === 0}
                    onClick={() => bulk.setAll(unassignedIds, true)}
                    className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-bold text-white/80 transition hover:bg-white/10 disabled:opacity-40"
                >
                    Tick all {unassignedIds.length} needing a driver
                </button>
                <select
                    value={employee}
                    onChange={(e) => setEmployee(e.target.value)}
                    aria-label="Give the ticked pickups to"
                    className="h-9 rounded-lg border border-white/10 bg-[#141518] px-2.5 text-xs text-white outline-none"
                >
                    <option value="">Give them to...</option>
                    {employees.map((e) => (
                        <option key={e.id} value={e.id}>
                            {e.full_name}
                        </option>
                    ))}
                </select>
                <button
                    type="button"
                    disabled={busy || count === 0 || !employee}
                    onClick={() => setAsking(true)}
                    className="rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-bold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
                >
                    Assign {count > 0 ? count : ""} selected
                </button>
            </div>

            {employee && others.length > 0 && (
                <fieldset>
                    <legend className="text-xs text-white/50">Also on these pickups (optional)</legend>
                    <div className="mt-1.5 flex flex-wrap gap-2">
                        {others.map((e) => (
                            <label key={e.id} className="flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 text-xs text-white/75">
                                <input
                                    type="checkbox"
                                    checked={crew.includes(e.id)}
                                    onChange={() => setCrew((prev) => (prev.includes(e.id) ? prev.filter((c) => c !== e.id) : [...prev, e.id]))}
                                    className="h-4 w-4 accent-amber-400"
                                />
                                {e.full_name}
                            </label>
                        ))}
                    </div>
                </fieldset>
            )}

            <ConfirmDialog
                open={asking}
                title={`Assign ${count} pickup${count === 1 ? "" : "s"} to ${lead?.full_name ?? "this employee"}?`}
                confirmLabel="Yes, assign them"
                busy={busy}
                onConfirm={run}
                onCancel={() => setAsking(false)}
            >
                <p>
                    Only pickups with nobody on them yet are changed, and each becomes locked once assigned. Pickups already assigned, started, serviced or dated in the past are left alone.
                    The employee and the customers are told as usual.
                </p>
            </ConfirmDialog>
        </div>
    );
}
