'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteRecyclable } from "@/app/admin/actions";
import ConfirmDialog from "@/components/dashboard/ConfirmDialog";

// Removes a recyclables entry that was logged by mistake, after a confirmation.
export default function RecyclableDeleteButton({ id, summary }: { id: string; summary: string }) {
    const router = useRouter();
    const [asking, setAsking] = useState(false);
    const [busy, setBusy] = useState(false);

    const remove = async () => {
        setBusy(true);
        const result = await deleteRecyclable(id);
        setBusy(false);
        setAsking(false);

        if (!result.success) {
            toast.error(result.error ?? "Could not remove it.");
            return;
        }

        toast.success("Entry removed");
        router.refresh();
    };

    return (
        <>
            <button
                type="button"
                onClick={() => setAsking(true)}
                aria-label={`Remove entry: ${summary}`}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-white/45 transition hover:text-red-300"
            >
                <Trash2 className="h-4 w-4" />
            </button>
            <ConfirmDialog open={asking} title="Remove this entry?" confirmLabel="Yes, remove it" tone="danger" busy={busy} onConfirm={remove} onCancel={() => setAsking(false)}>
                <p>{summary}. The stock balance changes to match.</p>
            </ConfirmDialog>
        </>
    );
}
