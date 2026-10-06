'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { editRecyclable } from "@/app/admin/actions/recyclables";
import { COMMON_MATERIALS, MATERIALS, type Movement } from "@/lib/recyclables";
import { todayLagos } from "@/lib/tasks";

const fieldClass =
    "h-11 w-full rounded-xl border border-white/10 bg-white/8 px-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-amber-300/50";
const labelClass = "mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-white/50";

// Corrects a recyclables entry in a small window. The direction (in or out)
// can't change: log a new entry for that instead.
export default function RecyclableEditButton({ entry }: { entry: Movement }) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [material, setMaterial] = useState<string>(entry.material);
    const [busy, setBusy] = useState(false);

    // The common materials, plus this entry's own if it is a less common one.
    const options = MATERIALS.filter((m) => COMMON_MATERIALS.some((c) => c.value === m.value) || m.value === entry.material);

    const submit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (busy) return;

        setBusy(true);
        const result = await editRecyclable(entry.id, new FormData(e.currentTarget));
        setBusy(false);

        if (!result.success) {
            toast.error(result.error ?? "Could not save the changes.");
            return;
        }

        toast.success("Entry updated");
        setOpen(false);
        router.refresh();
    };

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                aria-label="Edit this entry"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-white/45 transition hover:text-amber-300"
            >
                <Pencil className="h-4 w-4" />
            </button>

            {open && (
                <div role="dialog" aria-modal="true" aria-label="Edit entry" className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
                    <form onSubmit={submit} className="max-h-[90vh] w-full max-w-lg space-y-3 overflow-y-auto rounded-2xl border border-white/10 bg-[#141518] p-5">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-bold">Edit this entry ({entry.direction === "in" ? "came in" : "went out"})</h3>
                            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="text-white/50 hover:text-white">
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-3">
                            <div>
                                <label htmlFor={`re-material-${entry.id}`} className={labelClass}>
                                    Material
                                </label>
                                <select
                                    id={`re-material-${entry.id}`}
                                    name="material"
                                    value={material}
                                    onChange={(e) => setMaterial(e.target.value)}
                                    className={`${fieldClass} bg-[#141518]`}
                                >
                                    {options.map((m) => (
                                        <option key={m.value} value={m.value}>
                                            {m.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label htmlFor={`re-kg-${entry.id}`} className={labelClass}>
                                    Weight (kg)
                                </label>
                                <input id={`re-kg-${entry.id}`} name="kg" type="number" inputMode="decimal" min="0.01" step="0.01" required defaultValue={Number(entry.kg)} className={fieldClass} />
                            </div>
                            <div>
                                <label htmlFor={`re-date-${entry.id}`} className={labelClass}>
                                    Date
                                </label>
                                <input id={`re-date-${entry.id}`} name="date" type="date" required max={todayLagos()} defaultValue={entry.movement_date} className={fieldClass} />
                            </div>
                        </div>

                        {material === "other" && (
                            <div>
                                <label htmlFor={`re-other-${entry.id}`} className={labelClass}>
                                    What is it?
                                </label>
                                <input id={`re-other-${entry.id}`} name="materialNote" maxLength={80} required defaultValue={entry.material_note ?? ""} className={fieldClass} />
                            </div>
                        )}

                        <div>
                            <label htmlFor={`re-amount-${entry.id}`} className={labelClass}>
                                {entry.direction === "in" ? "Amount paid (₦)" : "Value (₦, optional)"}
                            </label>
                            <input
                                id={`re-amount-${entry.id}`}
                                name="amount"
                                type="number"
                                inputMode="decimal"
                                min="0"
                                step="0.01"
                                defaultValue={entry.amount == null ? "" : Number(entry.amount)}
                                placeholder="Leave empty if none"
                                className={fieldClass}
                            />
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                                <label htmlFor={`re-party-${entry.id}`} className={labelClass}>
                                    {entry.direction === "in" ? "Where from (optional)" : "Who took it (optional)"}
                                </label>
                                <input id={`re-party-${entry.id}`} name="party" maxLength={120} defaultValue={entry.party ?? ""} className={fieldClass} />
                            </div>
                            <div>
                                <label htmlFor={`re-note-${entry.id}`} className={labelClass}>
                                    Note (optional)
                                </label>
                                <input id={`re-note-${entry.id}`} name="note" maxLength={300} defaultValue={entry.note ?? ""} className={fieldClass} />
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-1">
                            <button type="button" onClick={() => setOpen(false)} className="h-11 rounded-xl border border-white/10 px-4 text-sm font-semibold text-white/70 hover:bg-white/10">
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={busy}
                                className="h-11 rounded-xl bg-amber-400 px-5 text-sm font-bold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {busy ? "Saving..." : "Save changes"}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </>
    );
}
