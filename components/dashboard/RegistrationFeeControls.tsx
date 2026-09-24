'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setRegistrationFee } from "@/app/admin/customer-actions";

// Confirm that a customer's ₦ registration fee arrived, or clear a report that
// did not check out. The same "Mark as paid" also covers existing customers
// who paid you directly before they ever signed up.
export default function RegistrationFeeControls({
                                                    profileId,
                                                    paid,
                                                    reported,
                                                    receiptUrl,
                                                    reportedNote,
                                                    reportedAt,
                                                    paidText,
                                                }: {
    profileId: string;
    paid: boolean;
    reported: boolean;
    receiptUrl: string | null;
    reportedNote: string | null;
    reportedAt: string | null;
    paidText: string;
}) {
    const router = useRouter();
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState<"confirm" | "reject" | null>(null);

    const run = async (action: "confirm" | "reject") => {
        setBusy(action);
        const result = await setRegistrationFee(profileId, action, note);
        setBusy(null);

        if (!result.success) {
            toast.error(result.error ?? "Something went wrong.");
            return;
        }

        toast.success(result.message ?? "Updated");
        setNote("");
        router.refresh();
    };

    if (paid) {
        return <p className="text-sm text-emerald-300">{paidText}</p>;
    }

    return (
        <div className="space-y-3">
            {reported ? (
                <div className="rounded-xl border border-amber-300/30 bg-amber-300/[0.07] p-4 text-sm">
                    <p className="font-semibold text-amber-200">
                        The customer says they have paid{reportedAt ? ` (reported ${reportedAt})` : ""}.
                    </p>
                    {reportedNote && <p className="mt-1 text-white/75">Their note: {reportedNote}</p>}
                    {receiptUrl ? (
                        <a href={receiptUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block font-semibold text-amber-300 underline underline-offset-2">
                            View receipt
                        </a>
                    ) : (
                        <p className="mt-1 text-white/45">No receipt attached.</p>
                    )}
                </div>
            ) : (
                <p className="text-sm text-white/55">
                    Not paid yet. If this customer paid you directly, for example before they joined the app, you can mark it as paid.
                </p>
            )}

            <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={300}
                aria-label="Note (optional)"
                placeholder="Note, for example paid in cash on 12 March (optional)"
                className="h-10 w-full rounded-xl border border-white/10 bg-white/8 px-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-amber-300/50"
            />

            <div className="flex flex-wrap gap-2">
                <button
                    disabled={busy !== null}
                    onClick={() => run("confirm")}
                    className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-black hover:bg-emerald-400 disabled:opacity-50"
                >
                    {busy === "confirm" ? "Saving..." : reported ? "Confirm payment" : "Mark as paid"}
                </button>
                {reported && (
                    <button
                        disabled={busy !== null}
                        onClick={() => run("reject")}
                        className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2 text-sm font-bold text-red-300 hover:bg-red-500/20 disabled:opacity-50"
                    >
                        {busy === "reject" ? "Saving..." : "Not received"}
                    </button>
                )}
            </div>
        </div>
    );
}
