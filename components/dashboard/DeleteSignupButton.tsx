'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteNoDetailsSignup } from "@/app/admin/customer-actions";
import ConfirmDialog from "@/components/dashboard/ConfirmDialog";

// Deletes a signup that has no customer record yet. Any full admin can do
// this since there is nothing billed or scheduled to lose.
export default function DeleteSignupButton({ profileId, name }: { profileId: string; name: string }) {
    const router = useRouter();
    const [confirming, setConfirming] = useState(false);
    const [busy, setBusy] = useState(false);

    const remove = async () => {
        setBusy(true);
        const result = await deleteNoDetailsSignup(profileId);
        setBusy(false);

        if (!result.success) {
            toast.error(result.error ?? "Could not delete this signup.");
            return;
        }

        toast.success(result.message ?? "Deleted");
        setConfirming(false);
        router.refresh();
    };

    return (
        <>
            <button
                type="button"
                onClick={() => setConfirming(true)}
                className="text-xs font-semibold text-red-300 underline underline-offset-2"
            >
                Delete
            </button>

            <ConfirmDialog
                open={confirming}
                title="Delete this signup?"
                confirmLabel="Yes, delete it"
                tone="danger"
                busy={busy}
                onConfirm={remove}
                onCancel={() => setConfirming(false)}
            >
                <p>
                    <span className="font-bold text-white">{name}</span> never filled in their property form, so there is nothing billed or
                    scheduled. Their login is erased for good and their email address is freed so they can sign up again. This cannot be undone.
                </p>
            </ConfirmDialog>
        </>
    );
}
