'use client';

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import type { InvoiceActionState } from "@/app/admin/actions";

function SubmitButton() {
    const { pending } = useFormStatus();

    return (
        <button
            type="submit"
            disabled={pending}
            className="w-full rounded-2xl bg-amber-400 px-4 py-2.5 font-bold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
            {pending ? "Creating…" : "Create Invoice"}
        </button>
    );
}

export default function CreateInvoiceForm({
                                               action,
                                               children,
                                           }: {
    action: (prevState: InvoiceActionState, formData: FormData) => Promise<InvoiceActionState>;
    children: React.ReactNode;
}) {
    const [state, formAction] = useActionState<InvoiceActionState, FormData>(action, null);
    const formRef = useRef<HTMLFormElement>(null);

    useEffect(() => {
        if (!state) return;

        if (state.success) {
            toast.success("Invoice created");
            formRef.current?.reset();
        } else if (state.error) {
            toast.error(state.error);
        }
    }, [state]);

    return (
        <form
            ref={formRef}
            action={formAction}
            className="space-y-3 rounded-3xl border border-white/10 bg-black/20 p-5"
        >
            <p className="text-xs uppercase tracking-[0.2em] text-white/45">Create invoice</p>
            {children}
            <SubmitButton />
        </form>
    );
}
