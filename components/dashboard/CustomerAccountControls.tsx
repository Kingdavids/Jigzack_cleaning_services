'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteCustomerAccount, setCustomerSuspended } from "@/app/admin/customer-actions";

// Suspend (reversible) and delete (permanent) for one customer.
export default function CustomerAccountControls({
                                                    profileId,
                                                    fullName,
                                                    suspended,
                                                    canDelete = true,
                                                }: {
    profileId: string;
    fullName: string;
    suspended: boolean;
    canDelete?: boolean;
}) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [typed, setTyped] = useState("");

    const toggleSuspend = async () => {
        const question = suspended
            ? `Reactivate ${fullName}? They will be able to sign in and be billed again.`
            : `Suspend ${fullName}? They will not be able to sign in, and they will be left out of invoices and schedules. Nothing is deleted, and you can reactivate them any time.`;

        if (!window.confirm(question)) return;

        setBusy(true);
        const result = await setCustomerSuspended(profileId, !suspended);
        setBusy(false);

        if (!result.success) {
            toast.error(result.error ?? "Something went wrong.");
            return;
        }

        toast.success(result.message ?? "Updated");
        router.refresh();
    };

    const remove = async () => {
        setBusy(true);
        const result = await deleteCustomerAccount(profileId, typed);
        setBusy(false);

        if (!result.success) {
            toast.error(result.error ?? "Something went wrong.");
            return;
        }

        toast.success("Customer deleted");
        router.push("/admin/customers");
        router.refresh();
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <p className="font-bold">{suspended ? "This account is suspended" : "Suspend this account"}</p>
                    <p className="text-sm text-white/55">
                        {suspended
                            ? "They cannot sign in, and they are left out of invoices and schedules."
                            : "Pauses the account without deleting anything. Use this for a customer who has stopped service or not paid."}
                    </p>
                </div>
                <button
                    disabled={busy}
                    onClick={toggleSuspend}
                    className={`shrink-0 rounded-xl px-4 py-2 text-sm font-bold transition disabled:opacity-50 ${
                        suspended
                            ? "bg-emerald-500 text-black hover:bg-emerald-400"
                            : "border border-amber-300/40 bg-amber-300/10 text-amber-200 hover:bg-amber-300/20"
                    }`}
                >
                    {suspended ? "Reactivate" : "Suspend"}
                </button>
            </div>

            {!canDelete && (
                <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/60">
                    Only an owner can delete a customer for good. Suspending is available to every admin.
                </p>
            )}

            {canDelete && (
            <div className="rounded-2xl border border-red-400/25 bg-red-500/[0.05] p-4">
                <p className="font-bold text-red-200">Delete this customer for good</p>
                <p className="mt-1 text-sm text-red-100/70">
                    Removes their login, details, invoices, receipts, pickups, photos and messages. This cannot be undone. For a real customer,
                    suspending is usually the safer choice, because deleting also removes their payment history.
                </p>

                {!confirming ? (
                    <button
                        onClick={() => setConfirming(true)}
                        className="mt-3 rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-2 text-sm font-bold text-red-300 hover:bg-red-500/20"
                    >
                        Delete customer
                    </button>
                ) : (
                    <div className="mt-3 space-y-3">
                        <label htmlFor="confirm-name" className="block text-sm text-white/80">
                            Type <span className="font-bold text-white">{fullName}</span> to confirm.
                        </label>
                        <input
                            id="confirm-name"
                            value={typed}
                            onChange={(e) => setTyped(e.target.value)}
                            autoComplete="off"
                            className="h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-red-300/50"
                        />
                        <div className="flex gap-3">
                            <button
                                disabled={busy || typed.trim().toLowerCase() !== fullName.trim().toLowerCase()}
                                onClick={remove}
                                className="rounded-xl bg-red-500 px-4 py-2 text-sm font-bold text-white hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                {busy ? "Deleting..." : "Delete permanently"}
                            </button>
                            <button
                                onClick={() => {
                                    setConfirming(false);
                                    setTyped("");
                                }}
                                className="rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white/80 hover:bg-white/10"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}
            </div>
            )}
        </div>
    );
}
