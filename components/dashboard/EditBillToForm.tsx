'use client';

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { updateBillToDetails } from "@/app/admin/actions/invoices";
import type { CustomerActionState } from "@/app/admin/actions/customers";
import type { BillTo } from "@/lib/billing/billTo";
import BillToFields from "@/components/dashboard/BillToFields";

function SaveButton() {
    const { pending } = useFormStatus();

    return (
        <button
            type="submit"
            disabled={pending}
            className="rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-bold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
            {pending ? "Saving…" : "Save details"}
        </button>
    );
}

// Corrects the name, property name, contact details or address on every
// invoice for someone not registered on the app. Folded away until opened.
export default function EditBillToForm({ invoiceIds, prepaymentIds = [], defaults }: { invoiceIds: string[]; prepaymentIds?: string[]; defaults: BillTo }) {
    const router = useRouter();
    const [state, formAction] = useActionState<CustomerActionState, FormData>(updateBillToDetails.bind(null, invoiceIds, prepaymentIds), null);

    useEffect(() => {
        if (!state) return;

        if (state.success) {
            toast.success(state.message ?? "Saved");
            router.refresh();
        } else if (state.error) {
            toast.error(state.error);
        }
    }, [state, router]);

    return (
        <details className="rounded-2xl border border-white/10 bg-black/20">
            <summary className="flex cursor-pointer list-none items-center gap-2 p-4 text-sm font-semibold text-amber-300 [&::-webkit-details-marker]:hidden">
                <Pencil className="h-4 w-4" />
                Edit details
            </summary>
            <form action={formAction} className="space-y-5 border-t border-white/10 p-4">
                <BillToFields defaults={defaults} />
                <p className="text-xs text-white/45">
                    Changes apply to all {invoiceIds.length} of their invoice{invoiceIds.length === 1 ? "" : "s"}, including ones already paid
                    {prepaymentIds.length > 0 ? `, and their ${prepaymentIds.length} advance payment${prepaymentIds.length === 1 ? "" : "s"}` : ""}.
                </p>
                <SaveButton />
            </form>
        </details>
    );
}
