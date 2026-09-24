'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { removeEmployee, restoreEmployee } from "@/app/admin/cleanup-actions";

// Remove (stops sign-in, keeps every record) or restore an employee.
export default function EmployeeAccessButtons({ profileId, name, removed }: { profileId: string; name: string; removed: boolean }) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);

    const run = async () => {
        const question = removed
            ? `Restore ${name}? They will be able to sign in and be assigned jobs again.`
            : `Remove ${name}? They will not be able to sign in, and their upcoming jobs become unassigned. Their past jobs, photos and expenses stay.`;

        if (!window.confirm(question)) return;

        setBusy(true);
        const result = await (removed ? restoreEmployee(profileId) : removeEmployee(profileId));
        setBusy(false);

        if (!result.success) {
            toast.error(result.error ?? "Something went wrong.");
            return;
        }

        toast.success(removed ? "Employee restored" : "Employee removed");
        router.refresh();
    };

    return (
        <button
            type="button"
            disabled={busy}
            onClick={run}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition disabled:opacity-50 ${
                removed
                    ? "border border-emerald-400/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                    : "border border-red-400/30 bg-red-500/10 text-red-300 hover:bg-red-500/20"
            }`}
        >
            {busy ? "Working..." : removed ? "Restore" : "Remove"}
        </button>
    );
}
