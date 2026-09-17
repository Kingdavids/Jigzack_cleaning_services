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

interface CustomerDetails {
    full_name: string;
    phone: string | null;
    whatsapp_number: string | null;
    address: string | null;
    lga: string | null;
    state: string | null;
    landmark: string | null;
    property_type: string | null;
    preferred_pickup_frequency: string | null;
    waste_type: string | null;
    special_notes: string | null;
}

interface EmployeeDetails {
    full_name: string;
    phone: string | null;
    address: string | null;
    lga: string | null;
    state: string | null;
}

export default function ApprovalsList({
                                          users,
                                          customerDetailsByProfileId = {},
                                          employeeDetailsByProfileId = {},
                                      }: {
    users: PendingUser[];
    customerDetailsByProfileId?: Record<string, CustomerDetails>;
    employeeDetailsByProfileId?: Record<string, EmployeeDetails>;
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
            {users.map((user) => {
                const details =
                    user.role === "customer"
                        ? customerDetailsByProfileId[user.id]
                        : undefined;

                const employeeDetails =
                    user.role === "employee"
                        ? employeeDetailsByProfileId[user.id]
                        : undefined;

                return (
                    <div
                        key={user.id}
                        className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl"
                    >
                        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
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

                        {user.role === "customer" && (
                            <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                                {details ? (
                                    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                                        <div>
                                            <dt className="text-white/40">Phone</dt>
                                            <dd>{details.phone || "Not provided"}</dd>
                                        </div>
                                        <div>
                                            <dt className="text-white/40">WhatsApp</dt>
                                            <dd>{details.whatsapp_number || "Not provided"}</dd>
                                        </div>
                                        <div className="sm:col-span-2">
                                            <dt className="text-white/40">Address</dt>
                                            <dd>
                                                {details.address || "Not provided"}
                                                {details.landmark ? ` (near ${details.landmark})` : ""}
                                            </dd>
                                        </div>
                                        <div>
                                            <dt className="text-white/40">LGA / State</dt>
                                            <dd>
                                                {[details.lga, details.state].filter(Boolean).join(", ") ||
                                                    "Not provided"}
                                            </dd>
                                        </div>
                                        <div>
                                            <dt className="text-white/40">Property type</dt>
                                            <dd className="capitalize">
                                                {details.property_type || "Not provided"}
                                            </dd>
                                        </div>
                                        <div>
                                            <dt className="text-white/40">Pickup frequency</dt>
                                            <dd>{details.preferred_pickup_frequency || "Not provided"}</dd>
                                        </div>
                                        <div>
                                            <dt className="text-white/40">Waste type</dt>
                                            <dd>{details.waste_type || "Not provided"}</dd>
                                        </div>
                                        {details.special_notes && (
                                            <div className="sm:col-span-2">
                                                <dt className="text-white/40">Notes</dt>
                                                <dd>{details.special_notes}</dd>
                                            </div>
                                        )}
                                    </dl>
                                ) : (
                                    <p className="text-sm text-amber-300/80">
                                        This customer hasn&apos;t submitted their property setup form
                                        yet — no details to review.
                                    </p>
                                )}
                            </div>
                        )}

                        {user.role === "employee" && (
                            <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                                {employeeDetails ? (
                                    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                                        <div>
                                            <dt className="text-white/40">Phone</dt>
                                            <dd>{employeeDetails.phone || "Not provided"}</dd>
                                        </div>
                                        <div>
                                            <dt className="text-white/40">LGA / State</dt>
                                            <dd>
                                                {[employeeDetails.lga, employeeDetails.state]
                                                    .filter(Boolean)
                                                    .join(", ") || "Not provided"}
                                            </dd>
                                        </div>
                                        <div className="sm:col-span-2">
                                            <dt className="text-white/40">Address</dt>
                                            <dd>{employeeDetails.address || "Not provided"}</dd>
                                        </div>
                                    </dl>
                                ) : (
                                    <p className="text-sm text-amber-300/80">
                                        This employee hasn&apos;t submitted their verification details
                                        yet — no details to review.
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
