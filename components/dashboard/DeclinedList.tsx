'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { reopenApplication } from "@/app/admin/actions";
import { deleteAllDeclinedSignups, deleteDeclinedSignup } from "@/app/admin/cleanup-actions";
import ConfirmDialog from "@/components/dashboard/ConfirmDialog";

export type DeclinedUser = {
    id: string;
    full_name: string | null;
    email: string | null;
    role: string | null;
    decline_reason: string | null;
    declined_at: string | null;
};

// Applications that were declined. If someone gets in touch afterwards, one
// click puts them back in the pending list to be reviewed again. An owner can
// also delete a declined signup for good, which frees their email address.
export default function DeclinedList({ users, isOwner = false }: { users: DeclinedUser[]; isOwner?: boolean }) {
    const router = useRouter();
    const [busyId, setBusyId] = useState<string | null>(null);
    const [deleting, setDeleting] = useState<DeclinedUser | "all" | null>(null);
    const [working, setWorking] = useState(false);
    const [typed, setTyped] = useState("");

    const reopen = async (id: string) => {
        setBusyId(id);
        const result = await reopenApplication(id);
        setBusyId(null);

        if (!result.success) {
            toast.error(result.error ?? "Something went wrong. Please try again.");
            return;
        }

        toast.success("Moved back to pending", { description: result.notes?.join(" "), duration: 6000 });
        router.refresh();
    };

    const remove = async () => {
        if (!deleting) return;

        setWorking(true);
        const result = deleting === "all" ? await deleteAllDeclinedSignups(typed) : await deleteDeclinedSignup(deleting.id);
        setWorking(false);

        if (!result.success) {
            toast.error(result.error ?? "Something went wrong. Please try again.");
            return;
        }

        toast.success(result.deleted && result.deleted > 1 ? `Deleted ${result.deleted} declined signups` : "Deleted");
        setDeleting(null);
        setTyped("");
        router.refresh();
    };

    if (users.length === 0) {
        return <p className="text-sm text-white/50">No declined applications.</p>;
    }

    return (
        <div className="space-y-3">
            {isOwner && (
                <div className="flex justify-end">
                    <button
                        type="button"
                        onClick={() => {
                            setTyped("");
                            setDeleting("all");
                        }}
                        className="h-11 rounded-xl border border-red-400/30 bg-red-500/10 px-4 text-sm font-semibold text-red-300 transition hover:bg-red-500/20 sm:h-10"
                    >
                        Delete all declined ({users.length})
                    </button>
                </div>
            )}

            {users.map((user) => (
                <div
                    key={user.id}
                    className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:flex-row md:items-center md:justify-between"
                >
                    <div className="min-w-0">
                        <p className="font-bold">{user.full_name ?? "Unnamed"}</p>
                        <p className="truncate text-sm text-white/60">{user.email}</p>
                        <p className="mt-1 text-xs capitalize text-white/45">
                            {user.role ?? "customer"}
                            {user.declined_at
                                ? ` · declined ${new Date(user.declined_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
                                : ""}
                        </p>
                        {user.decline_reason && (
                            <p className="mt-2 text-sm text-red-200/80">Reason given: {user.decline_reason}</p>
                        )}
                    </div>

                    <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                        <button
                            disabled={busyId === user.id}
                            onClick={() => reopen(user.id)}
                            className="h-11 rounded-xl border border-amber-300/40 bg-amber-300/10 px-4 text-sm font-bold text-amber-200 transition hover:bg-amber-300/20 disabled:opacity-50 sm:h-10"
                        >
                            {busyId === user.id ? "Moving..." : "Move back to pending"}
                        </button>
                        {isOwner && (
                            <button
                                type="button"
                                onClick={() => setDeleting(user)}
                                className="h-11 rounded-xl border border-red-400/30 bg-red-500/10 px-4 text-sm font-semibold text-red-300 transition hover:bg-red-500/20 sm:h-10"
                            >
                                Delete
                            </button>
                        )}
                    </div>
                </div>
            ))}

            <ConfirmDialog
                open={deleting !== null}
                title={deleting === "all" ? `Delete all ${users.length} declined signups?` : "Delete this declined signup?"}
                confirmLabel={deleting === "all" ? "Yes, delete them all" : "Yes, delete it"}
                tone="danger"
                busy={working}
                onConfirm={remove}
                onCancel={() => {
                    setDeleting(null);
                    setTyped("");
                }}
            >
                {deleting === "all" ? (
                    <>
                        <p>
                            Their logins and anything they filled in are erased for good, and their email addresses are freed so they can sign up again.
                            This cannot be undone.
                        </p>
                        <label className="mt-3 block text-xs text-white/50">
                            Type DELETE to confirm
                            <input
                                value={typed}
                                onChange={(e) => setTyped(e.target.value)}
                                autoComplete="off"
                                className="mt-1 h-11 w-full rounded-lg border border-white/10 bg-white/8 px-3 text-base text-white outline-none focus:border-red-300/50 sm:text-sm"
                            />
                        </label>
                    </>
                ) : (
                    <p>
                        <span className="font-bold text-white">{deleting?.full_name ?? deleting?.email ?? "This signup"}</span>
                        {deleting?.email && deleting.full_name ? ` (${deleting.email})` : ""} is erased for good, and their email address is freed so they
                        can sign up again. This cannot be undone.
                    </p>
                )}
            </ConfirmDialog>
        </div>
    );
}
