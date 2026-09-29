'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { confirmSignupEmail } from "@/app/admin/cleanup-actions";
import ConfirmDialog from "@/components/dashboard/ConfirmDialog";

// For when Supabase's own confirmation email never reaches someone. Owner
// only, since it skips the one check that proves they own that email address.
export default function ConfirmEmailButton({ profileId, name }: { profileId: string; name: string }) {
    const router = useRouter();
    const [confirming, setConfirming] = useState(false);
    const [busy, setBusy] = useState(false);

    const confirm = async () => {
        setBusy(true);
        const result = await confirmSignupEmail(profileId);
        setBusy(false);

        if (!result.success) {
            toast.error(result.error ?? "Could not confirm this email.");
            return;
        }

        toast.success("Email confirmed");
        setConfirming(false);
        router.refresh();
    };

    return (
        <>
            <button
                type="button"
                onClick={() => setConfirming(true)}
                className="text-xs font-semibold text-sky-300 underline underline-offset-2"
            >
                Confirm email
            </button>

            <ConfirmDialog
                open={confirming}
                title="Confirm this signup's email by hand?"
                confirmLabel="Yes, confirm it"
                busy={busy}
                onConfirm={confirm}
                onCancel={() => setConfirming(false)}
            >
                <p>
                    Use this only when you are sure <span className="font-bold text-white">{name}</span> owns that email address, for example
                    because they told you Supabase&apos;s confirmation email never arrived. They can then continue signing up without clicking
                    anything in an email.
                </p>
            </ConfirmDialog>
        </>
    );
}
