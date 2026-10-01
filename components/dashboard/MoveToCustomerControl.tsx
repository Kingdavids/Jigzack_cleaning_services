'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserCheck } from "lucide-react";
import { toast } from "sonner";
import { moveInvoicesToCustomer } from "@/app/admin/actions";
import ConfirmDialog from "@/components/dashboard/ConfirmDialog";

// Moves everything billed to someone who wasn't registered onto the customer
// account they have since made, after a confirmation.
export default function MoveToCustomerControl({
                                                  personName,
                                                  invoiceIds,
                                                  customers,
                                                  suggested,
                                              }: {
    personName: string;
    invoiceIds: string[];
    customers: { id: string; full_name: string | null }[];
    // A registered customer with the same phone or email, if there is one.
    suggested: { id: string; full_name: string | null; reason: string } | null;
}) {
    const router = useRouter();
    const [customerId, setCustomerId] = useState(suggested?.id ?? "");
    const [asking, setAsking] = useState(false);
    const [busy, setBusy] = useState(false);
    const chosen = customers.find((c) => c.id === customerId);

    const move = async () => {
        setBusy(true);
        const result = await moveInvoicesToCustomer(invoiceIds, customerId);
        setBusy(false);
        setAsking(false);

        if (!result.success) {
            toast.error(result.error ?? "Could not move them.");
            return;
        }

        toast.success(result.message ?? "Moved");
        router.refresh();
    };

    return (
        <div className="rounded-2xl border border-sky-400/20 bg-sky-400/[0.05] p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-sky-200">
                <UserCheck className="h-4 w-4" />
                Have they registered?
            </p>
            {suggested && (
                <p className="mt-1 text-xs text-white/60">
                    Looks like <span className="font-semibold text-white">{suggested.full_name}</span>: {suggested.reason}.
                </p>
            )}
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <select
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                    aria-label="Their customer account"
                    className="h-11 w-full rounded-xl border border-white/10 bg-[#141518] px-3 text-sm text-white outline-none sm:max-w-xs"
                >
                    <option value="">Choose their customer account</option>
                    {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                            {c.full_name}
                            {c.id === suggested?.id ? " (likely match)" : ""}
                        </option>
                    ))}
                </select>
                <button
                    type="button"
                    disabled={!customerId || busy}
                    onClick={() => setAsking(true)}
                    className="h-11 rounded-xl bg-sky-400 px-4 text-sm font-bold text-black transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    Move to customer
                </button>
            </div>

            <ConfirmDialog
                open={asking}
                title="Move these invoices to a customer?"
                confirmLabel="Yes, move them"
                busy={busy}
                onConfirm={move}
                onCancel={() => setAsking(false)}
            >
                <p>
                    {invoiceIds.length} invoice{invoiceIds.length === 1 ? "" : "s"} for {personName}, with every payment and receipt on them, move to{" "}
                    <span className="font-bold text-white">{chosen?.full_name ?? "the customer"}</span>.
                </p>
                <p className="mt-2">They then show in that customer&apos;s record and in the customer&apos;s own dashboard.</p>
            </ConfirmDialog>
        </div>
    );
}
