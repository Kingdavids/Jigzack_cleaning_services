'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteExpense } from "@/app/employee/actions";

// Lets staff withdraw an entry the admin hasn't looked at yet.
export default function ExpenseDeleteButton({ expenseId }: { expenseId: string }) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);

    const remove = async () => {
        if (!window.confirm("Remove this expense?")) return;

        setBusy(true);
        const result = await deleteExpense(expenseId);
        setBusy(false);

        if (!result?.success) {
            toast.error(result?.error ?? "Could not remove this expense.");
            return;
        }

        toast.success("Expense removed");
        router.refresh();
    };

    return (
        <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="text-xs font-semibold text-red-300 underline underline-offset-2 hover:text-red-200 disabled:opacity-50"
        >
            {busy ? "Removing..." : "Remove"}
        </button>
    );
}
