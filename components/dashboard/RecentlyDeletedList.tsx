'use client';

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { restoreCustomer } from "@/app/admin/customer-actions";

export type DeletedCustomer = {
    id: string;
    profile_id: string | null;
    full_name: string;
    email: string | null;
    deleted_at: string | null;
    daysLeft: number;
};

// Customers waiting in Recently deleted. Owners can restore them here; every
// admin can open one to see what is on file.
export default function RecentlyDeletedList({ customers, isOwner }: { customers: DeletedCustomer[]; isOwner: boolean }) {
    const router = useRouter();
    const [busyId, setBusyId] = useState<string | null>(null);

    const restore = async (customer: DeletedCustomer) => {
        if (!customer.profile_id) return;
        if (!window.confirm(`Restore ${customer.full_name}? They come back exactly as they were.`)) return;

        setBusyId(customer.id);
        const result = await restoreCustomer(customer.profile_id);
        setBusyId(null);

        if (!result.success) {
            toast.error(result.error ?? "Something went wrong.");
            return;
        }

        toast.success(result.message ?? "Restored");
        router.refresh();
    };

    return (
        <div className="space-y-3">
            {customers.map((customer) => (
                <div
                    key={customer.id}
                    className="flex flex-col gap-3 rounded-2xl border border-red-400/20 bg-red-500/[0.04] p-4 md:flex-row md:items-center md:justify-between"
                >
                    <div className="min-w-0">
                        <p className="font-bold">{customer.full_name}</p>
                        <p className="truncate text-sm text-white/55">{customer.email ?? "No email"}</p>
                        <p className="mt-1 text-xs text-red-200/80">
                            Erased for good in {customer.daysLeft} day{customer.daysLeft === 1 ? "" : "s"}
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {customer.profile_id && (
                            <Link
                                href={`/admin/customers/${customer.profile_id}`}
                                className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/10"
                            >
                                View
                            </Link>
                        )}
                        {isOwner && customer.profile_id && (
                            <button
                                disabled={busyId === customer.id}
                                onClick={() => restore(customer)}
                                className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-black hover:bg-emerald-400 disabled:opacity-50"
                            >
                                {busyId === customer.id ? "Restoring..." : "Restore"}
                            </button>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}
