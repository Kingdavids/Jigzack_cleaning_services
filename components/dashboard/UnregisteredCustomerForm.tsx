'use client';

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { saveUnregisteredCustomer, type UnregisteredState } from "@/app/admin/actions/unregistered";
import BillToFields from "@/components/dashboard/BillToFields";
import type { UnregisteredCustomer } from "@/lib/billing/unregistered";

const inputClass =
    "h-11 w-full rounded-xl border border-white/10 bg-white/8 px-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-amber-300/50";

const labelClass = "mb-1 block text-[11px] uppercase tracking-[0.12em] text-white/40";

function SaveButton({ editing }: { editing: boolean }) {
    const { pending } = useFormStatus();

    return (
        <button
            type="submit"
            disabled={pending}
            className="rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-bold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
            {pending ? "Saving…" : editing ? "Save changes" : "Add to the list"}
        </button>
    );
}

// Adds someone to the Unregistered customers list, or edits one already on it.
export default function UnregisteredCustomerForm({ person }: { person?: UnregisteredCustomer }) {
    const router = useRouter();
    const formRef = useRef<HTMLFormElement>(null);
    const [state, formAction] = useActionState<UnregisteredState, FormData>(saveUnregisteredCustomer, null);

    useEffect(() => {
        if (!state) return;

        if (state.success) {
            toast.success(person ? "Changes saved" : "Added to the list");
            if (!person) formRef.current?.reset();
            router.refresh();
        } else if (state.error) toast.error(state.error);
    }, [state, person, router]);

    return (
        <form ref={formRef} action={formAction} className="space-y-5">
            {person && <input type="hidden" name="id" value={person.id} />}

            <fieldset className="rounded-xl border border-amber-300/25 bg-amber-300/[0.05] p-4">
                <legend className="px-1 text-sm font-semibold text-amber-200">Monthly charge</legend>
                <label className="block sm:max-w-xs">
                    <span className={labelClass}>Charged every month (₦)</span>
                    <input
                        name="monthlyRate"
                        type="number"
                        inputMode="decimal"
                        min="1"
                        step="any"
                        required
                        defaultValue={person ? Number(person.monthly_rate) : ""}
                        placeholder="e.g. 15000"
                        className={inputClass}
                    />
                </label>
                <p className="mt-2 text-xs text-white/50">
                    This is the amount on their invoice on the 25th of each month, for the month that starts then.
                </p>
            </fieldset>

            <BillToFields defaults={person ?? undefined} />

            <label className="block">
                <span className={labelClass}>Note (optional, for your own reference)</span>
                <input name="note" maxLength={500} defaultValue={person?.note ?? ""} className={inputClass} />
            </label>

            <SaveButton editing={Boolean(person)} />
        </form>
    );
}
