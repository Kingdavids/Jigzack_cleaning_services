'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { reopenApplication } from "@/app/admin/actions";

export type DeclinedUser = {
    id: string;
    full_name: string | null;
    email: string | null;
    role: string | null;
    decline_reason: string | null;
    declined_at: string | null;
};

// Applications that were declined. If someone gets in touch afterwards, one
// click puts them back in the pending list to be reviewed again.
export default function DeclinedList({ users }: { users: DeclinedUser[] }) {
    const router = useRouter();
    const [busyId, setBusyId] = useState<string | null>(null);

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

    if (users.length === 0) {
        return <p className="text-sm text-white/50">No declined applications.</p>;
    }

    return (
        <div className="space-y-3">
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

                    <button
                        disabled={busyId === user.id}
                        onClick={() => reopen(user.id)}
                        className="shrink-0 rounded-xl border border-amber-300/40 bg-amber-300/10 px-4 py-2 text-sm font-bold text-amber-200 transition hover:bg-amber-300/20 disabled:opacity-50"
                    >
                        {busyId === user.id ? "Moving..." : "Move back to pending"}
                    </button>
                </div>
            ))}
        </div>
    );
}
