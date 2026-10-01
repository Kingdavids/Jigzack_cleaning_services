'use client';

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createInvoice, type NewInvoiceState } from "@/app/admin/actions";
import InvoiceBuilder from "@/components/dashboard/InvoiceBuilder";

const inputClass =
    "h-11 w-full rounded-xl border border-white/10 bg-white/8 px-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-amber-300/50";

const labelClass = "mb-1 block text-[11px] uppercase tracking-[0.12em] text-white/40";

function SubmitButton() {
    const { pending } = useFormStatus();

    return (
        <button
            type="submit"
            disabled={pending}
            className="w-full rounded-2xl bg-amber-400 px-4 py-3 font-bold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
            {pending ? "Creating…" : "Create invoice"}
        </button>
    );
}

export type InvoiceCustomerOption = {
    id: string;
    full_name: string | null;
    // Billable units on their record (vacant ones left out), by facility key.
    counts: Record<string, number>;
};

// A hand-made invoice for a registered customer. Choosing them fills in the
// units from their record; the months it covers are skipped by the automatic
// monthly invoice. It opens once created, as the customer will see it.
export default function OneOffInvoiceForm({
                                              customers,
                                              defaultStartMonth,
                                          }: {
    customers: InvoiceCustomerOption[];
    defaultStartMonth: string;
}) {
    const router = useRouter();
    const [state, formAction] = useActionState<NewInvoiceState, FormData>(createInvoice, null);
    const [customerId, setCustomerId] = useState("");
    const chosen = customers.find((c) => c.id === customerId);

    useEffect(() => {
        if (!state) return;

        if (state.success && state.invoiceId) {
            toast.success("Invoice created");
            router.push(`/admin/invoices/${state.invoiceId}`);
        } else if (state.error) {
            toast.error(state.error);
        }
    }, [state, router]);

    return (
        <form action={formAction} className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                    <span className={labelClass}>
                        Customer<span className="ml-1 text-amber-300">*</span>
                    </span>
                    <select
                        name="customerId"
                        required
                        value={customerId}
                        onChange={(e) => setCustomerId(e.target.value)}
                        className={`${inputClass} bg-[#141518]`}
                    >
                        <option value="" disabled>
                            Select customer
                        </option>
                        {customers.map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.full_name}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="block">
                    <span className={labelClass}>Description</span>
                    <input name="description" placeholder="Waste management service" maxLength={200} className={inputClass} />
                </label>
            </div>

            {customerId ? (
                // Rebuilt for each customer, so their own units fill in.
                <InvoiceBuilder key={customerId} defaultStartMonth={defaultStartMonth} initialCounts={chosen?.counts ?? {}} />
            ) : (
                <p className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white/50">
                    Choose a customer to fill in their property details.
                </p>
            )}

            <SubmitButton />
        </form>
    );
}
