'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { inviteAdditionalProperty } from "@/app/admin/cleanup-actions";
import ConfirmDialog from "@/components/dashboard/ConfirmDialog";

// Invites an existing customer to manage another billed property from their
// same login. Creates a second login behind the scenes; the customer never
// sees or uses it, they just get an "Add another property" option next time
// they open their own dashboard.
export default function InvitePropertyButton({ profileId, name }: { profileId: string; name: string }) {
    const router = useRouter();
    const [confirming, setConfirming] = useState(false);
    const [busy, setBusy] = useState(false);

    const invite = async () => {
        setBusy(true);
        const result = await inviteAdditionalProperty(profileId);
        setBusy(false);

        if (!result.success) {
            toast.error(result.error ?? "Could not send this invite.");
            return;
        }

        toast.success(result.message ?? "Invited");
        setConfirming(false);
        router.refresh();
    };

    return (
        <>
            <button
                type="button"
                onClick={() => setConfirming(true)}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white/80 transition hover:bg-white/10"
            >
                Invite to add another property
            </button>

            <ConfirmDialog
                open={confirming}
                title="Invite this customer to add another property?"
                confirmLabel="Yes, invite them"
                busy={busy}
                onConfirm={invite}
                onCancel={() => setConfirming(false)}
            >
                <p>
                    {name} gets an &quot;Add another property&quot; option next time they open their dashboard, still signing in with the same
                    email and password. The new property bills separately, with its own invoices and receipts, and no registration fee since
                    they are already a customer.
                </p>
            </ConfirmDialog>
        </>
    );
}
