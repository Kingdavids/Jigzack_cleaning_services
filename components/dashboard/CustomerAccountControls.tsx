'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
    deleteCustomerAccount,
    restoreCustomer,
    setCustomerSuspended,
    softDeleteCustomer,
} from "@/app/admin/customer-actions";

// Suspend (reversible), delete (goes to Recently deleted, reversible for 30
// days by an owner), and for a customer already in Recently deleted: restore
// or delete for good (owners only).
export default function CustomerAccountControls({
                                                    profileId,
                                                    fullName,
                                                    suspended,
                                                    deleted = false,
                                                    daysLeft = 30,
                                                    isOwner = true,
                                                }: {
    profileId: string;
    fullName: string;
    suspended: boolean;
    deleted?: boolean;
    daysLeft?: number;
    isOwner?: boolean;
}) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const [confirming, setConfirming] = useState<"delete" | "forever" | null>(null);
    const [typed, setTyped] = useState("");

    const matches = typed.trim().toLowerCase() === fullName.trim().toLowerCase();

    const done = (message: string, leave = false) => {
        toast.success(message);
        setConfirming(null);
        setTyped("");
        if (leave) router.push("/admin/customers");
        router.refresh();
    };

    const run = async (task: () => Promise<{ success: boolean; error?: string; message?: string }>, leave = false) => {
        setBusy(true);
        const result = await task();
        setBusy(false);

        if (!result.success) {
            toast.error(result.error ?? "Something went wrong.");
            return;
        }

        done(result.message ?? "Done", leave);
    };

    const toggleSuspend = () => {
        const question = suspended
            ? `Reactivate ${fullName}? They will be able to sign in and be billed again.`
            : `Suspend ${fullName}? They will not be able to sign in, and they will be left out of invoices and schedules. Nothing is deleted, and you can reactivate them any time.`;

        if (!window.confirm(question)) return;
        run(() => setCustomerSuspended(profileId, !suspended));
    };

    const confirmBox = (label: string, action: () => void) => (
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
                    disabled={busy || !matches}
                    onClick={action}
                    className="rounded-xl bg-red-500 px-4 py-2 text-sm font-bold text-white hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                    {busy ? "Working..." : label}
                </button>
                <button
                    onClick={() => {
                        setConfirming(null);
                        setTyped("");
                    }}
                    className="rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white/80 hover:bg-white/10"
                >
                    Cancel
                </button>
            </div>
        </div>
    );

    if (deleted) {
        return (
            <div className="space-y-4">
                <div className="rounded-2xl border border-red-400/25 bg-red-500/[0.05] p-4">
                    <p className="font-bold text-red-200">This customer is in Recently deleted</p>
                    <p className="mt-1 text-sm text-red-100/70">
                        Nothing has been erased yet. They cannot sign in and they are left out of invoices and schedules. They will be erased for
                        good in {daysLeft} day{daysLeft === 1 ? "" : "s"}.
                    </p>
                </div>

                {isOwner ? (
                    <div className="space-y-3">
                        <button
                            disabled={busy}
                            onClick={() => {
                                if (window.confirm(`Restore ${fullName}? They come back exactly as they were.`)) run(() => restoreCustomer(profileId));
                            }}
                            className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-black hover:bg-emerald-400 disabled:opacity-50"
                        >
                            Restore customer
                        </button>

                        <div className="rounded-2xl border border-red-400/25 bg-red-500/[0.05] p-4">
                            <p className="font-bold text-red-200">Delete for good now</p>
                            <p className="mt-1 text-sm text-red-100/70">
                                Removes their login, details, invoices, receipts, pickups, photos and messages. This cannot be undone.
                            </p>
                            {confirming !== "forever" ? (
                                <button
                                    onClick={() => setConfirming("forever")}
                                    className="mt-3 rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-2 text-sm font-bold text-red-300 hover:bg-red-500/20"
                                >
                                    Delete forever
                                </button>
                            ) : (
                                confirmBox("Delete permanently", () => run(() => deleteCustomerAccount(profileId, typed), true))
                            )}
                        </div>
                    </div>
                ) : (
                    <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/60">
                        Only an owner can restore a customer or delete them for good.
                    </p>
                )}
            </div>
        );
    }

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

            <div className="rounded-2xl border border-red-400/25 bg-red-500/[0.05] p-4">
                <p className="font-bold text-red-200">Delete this customer</p>
                <p className="mt-1 text-sm text-red-100/70">
                    Moves them to Recently deleted. They cannot sign in and are left out of invoices and schedules. Nothing is erased for 30 days,
                    and an owner can restore them until then.
                </p>

                {confirming !== "delete" ? (
                    <button
                        onClick={() => setConfirming("delete")}
                        className="mt-3 rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-2 text-sm font-bold text-red-300 hover:bg-red-500/20"
                    >
                        Delete customer
                    </button>
                ) : (
                    confirmBox("Move to Recently deleted", () => run(() => softDeleteCustomer(profileId, typed), true))
                )}
            </div>
        </div>
    );
}
