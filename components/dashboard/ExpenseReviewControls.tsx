'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { reviewExpense } from "@/app/admin/actions";

type Status = "approved" | "reimbursed" | "rejected";

// Admin decision buttons for one expense, with an optional note the staff
// member can read.
export default function ExpenseReviewControls({
                                                  expenseId,
                                                  current,
                                                  currentNote,
                                              }: {
    expenseId: string;
    current: string;
    currentNote: string | null;
}) {
    const router = useRouter();
    const [note, setNote] = useState(currentNote ?? "");
    const [busy, setBusy] = useState<Status | null>(null);

    const decide = async (status: Status) => {
        setBusy(status);
        const result = await reviewExpense(expenseId, status, note);
        setBusy(null);

        if (!result.success) {
            toast.error(result.error ?? "Something went wrong.");
            return;
        }

        toast.success(status === "rejected" ? "Expense rejected" : status === "approved" ? "Expense approved" : "Marked as reimbursed");
        router.refresh();
    };

    const button = "rounded-lg px-3 py-1.5 text-xs font-bold transition disabled:opacity-50";

    return (
        <div className="mt-3 border-t border-white/10 pt-3">
            <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
                aria-label="Note to staff (optional)"
                placeholder="Note to staff (optional)"
                className="mb-2 h-9 w-full rounded-lg border border-white/10 bg-white/8 px-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-amber-300/50"
            />
            <div className="flex flex-wrap gap-2">
                {current !== "approved" && (
                    <button
                        disabled={busy !== null}
                        onClick={() => decide("approved")}
                        className={`${button} bg-sky-500/90 text-black hover:bg-sky-400`}
                    >
                        {busy === "approved" ? "Saving..." : "Approve"}
                    </button>
                )}
                {current !== "reimbursed" && (
                    <button
                        disabled={busy !== null}
                        onClick={() => decide("reimbursed")}
                        className={`${button} bg-emerald-500/90 text-black hover:bg-emerald-400`}
                    >
                        {busy === "reimbursed" ? "Saving..." : "Mark reimbursed"}
                    </button>
                )}
                {current !== "rejected" && (
                    <button
                        disabled={busy !== null}
                        onClick={() => decide("rejected")}
                        className={`${button} border border-red-400/30 bg-red-500/10 text-red-300 hover:bg-red-500/20`}
                    >
                        {busy === "rejected" ? "Saving..." : "Reject"}
                    </button>
                )}
            </div>
        </div>
    );
}
