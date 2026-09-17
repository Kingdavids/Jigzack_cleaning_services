'use client';

import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface PendingUser {
    id: string;
    full_name: string;
    email: string;
    role: "customer" | "employee";
    created_at: string;
}

export default function ApprovalsList({
                                          users,
                                      }: {
    users: PendingUser[];
}) {
    const supabase = createClient();
    const router = useRouter();
    const [loadingId, setLoadingId] = useState<string | null>(null);

    const updateStatus = async (
        id: string,
        status: "approved" | "declined"
    ) => {
        setLoadingId(id);

        const { error } = await supabase
            .from("profiles")
            .update({ status })
            .eq("id", id);

        setLoadingId(null);

        if (!error) {
            router.refresh();
        }
    };

    return (
        <div className="space-y-4">
            {users.map((user) => (
                <div
                    key={user.id}
                    className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl"
                >
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div>
                            <p className="text-lg font-bold">{user.full_name}</p>
                            <p className="text-sm text-white/60">{user.email}</p>
                            <p className="mt-2 text-sm text-white/50 capitalize">
                                Role: <span className="text-amber-300">{user.role}</span>
                            </p>
                        </div>

                        <div className="flex gap-3">
                            <button
                                disabled={loadingId === user.id}
                                onClick={() => updateStatus(user.id, "approved")}
                                className="rounded-2xl bg-emerald-500 px-5 py-2 font-bold text-black hover:bg-emerald-400 disabled:opacity-50"
                            >
                                Approve
                            </button>

                            <button
                                disabled={loadingId === user.id}
                                onClick={() => updateStatus(user.id, "declined")}
                                className="rounded-2xl border border-red-400/30 bg-red-500/10 px-5 py-2 font-bold text-red-300 hover:bg-red-500/20 disabled:opacity-50"
                            >
                                Decline
                            </button>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}