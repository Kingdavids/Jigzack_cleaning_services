'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteCustomerRecord } from "@/app/admin/customer-actions";

// For a customer record that has no login: it can only be removed.
export default function OrphanCustomerActions({ customerId, fullName }: { customerId: string; fullName: string }) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);

    const remove = async () => {
        if (!window.confirm(`Remove the record for ${fullName}? This cannot be undone.`)) return;

        setBusy(true);
        const result = await deleteCustomerRecord(customerId);
        setBusy(false);

        if (!result.success) {
            toast.error(result.error ?? "Something went wrong.");
            return;
        }

        toast.success("Record removed");
        router.refresh();
    };

    return (
        <button
            type="button"
            disabled={busy}
            onClick={remove}
            className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-300 hover:bg-red-500/20 disabled:opacity-50"
        >
            {busy ? "Removing..." : "Remove record"}
        </button>
    );
}
