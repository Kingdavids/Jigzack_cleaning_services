'use client';

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createNonCustomerInvoice, type NewInvoiceState } from "@/app/admin/actions";
import InvoiceBuilder from "@/components/dashboard/InvoiceBuilder";
import BillToFields from "@/components/dashboard/BillToFields";

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

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
    return (
        <label className="block">
            <span className={labelClass}>
                {label}
                {required && <span className="ml-1 text-amber-300">*</span>}
            </span>
            {children}
        </label>
    );
}

// Bills someone who is not registered on the app. Everything the invoice
// needs is filled in here; once created it opens, ready to print, download
// or share with them.
export default function NonCustomerInvoiceForm({ defaultStartMonth }: { defaultStartMonth: string }) {
    const router = useRouter();
    const [state, formAction] = useActionState<NewInvoiceState, FormData>(createNonCustomerInvoice, null);

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
            <BillToFields />

            <Field label="Description">
                <input name="description" placeholder="Waste management service" maxLength={200} className={inputClass} />
            </Field>

            <InvoiceBuilder defaultStartMonth={defaultStartMonth} />

            <SubmitButton />
        </form>
    );
}
