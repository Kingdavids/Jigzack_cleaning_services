'use client';

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createNonCustomerInvoice, type NewInvoiceState } from "@/app/admin/actions/invoices";
import InvoiceBuilder from "@/components/dashboard/InvoiceBuilder";
import BillToFields from "@/components/dashboard/BillToFields";
import type { InvoiceKind } from "@/components/dashboard/InvoiceBuilder";
import type { BillTo } from "@/lib/billing/billTo";

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

// Someone invoiced before without an account, as one line to pick from and the
// details to start the new invoice with.
export type KnownPerson = { label: string; billTo: BillTo };

// Bills someone who is not registered on the app. Everything the invoice
// needs is filled in here; once created it opens, ready to print, download
// or share with them.
export default function NonCustomerInvoiceForm({
                                                   defaultStartMonth,
                                                   kind = "service",
                                                   stock = {},
                                                   knownPeople = [],
                                               }: {
    defaultStartMonth: string;
    kind?: InvoiceKind;
    stock?: Record<string, number>;
    knownPeople?: KnownPerson[];
}) {
    const router = useRouter();
    const [search, setSearch] = useState("");
    const [chosen, setChosen] = useState<KnownPerson | null>(null);
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
            {knownPeople.length > 0 && (
                <div className="rounded-xl border border-amber-300/25 bg-amber-300/[0.05] p-4">
                    <label className="block">
                        <span className={labelClass}>Invoiced before? Pick them to fill in their details</span>
                        <input
                            list="known-people"
                            value={search}
                            onChange={(e) => {
                                setSearch(e.target.value);
                                setChosen(knownPeople.find((person) => person.label === e.target.value) ?? null);
                            }}
                            placeholder="Start typing a name, phone number or address"
                            autoComplete="off"
                            className={inputClass}
                        />
                    </label>
                    <datalist id="known-people">
                        {knownPeople.map((person) => (
                            <option key={person.label} value={person.label} />
                        ))}
                    </datalist>
                    <p className="mt-2 text-xs text-white/50">
                        {chosen
                            ? "Their details are filled in below. You can change any of them for this invoice only."
                            : "People you have invoiced or listed as not registered. Or leave this empty and type in a new person's details."}
                    </p>
                </div>
            )}

            <BillToFields key={chosen?.label ?? "new"} defaults={chosen?.billTo} kind={kind} />

            <Field label="Description">
                <input
                    name="description"
                    placeholder={kind === "recyclables" ? "Sale of recyclables" : kind === "other" ? "Services and items" : "Waste management service"}
                    maxLength={200}
                    className={inputClass}
                />
            </Field>

            <InvoiceBuilder key={kind} defaultStartMonth={defaultStartMonth} kind={kind} stock={stock} />

            <SubmitButton />
        </form>
    );
}
