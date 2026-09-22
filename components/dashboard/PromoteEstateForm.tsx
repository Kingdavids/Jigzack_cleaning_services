'use client';

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import type { EstateActionState } from "@/app/admin/actions";

function SubmitButton() {
    const { pending } = useFormStatus();
    return (
        <button
            type="submit"
            disabled={pending}
            className="rounded-xl bg-amber-400 px-4 py-2.5 font-bold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
            {pending ? "Promoting…" : "Mark as Estate"}
        </button>
    );
}

export default function PromoteEstateForm({
                                               action,
                                               candidates,
                                           }: {
    action: (prevState: EstateActionState, formData: FormData) => Promise<EstateActionState>;
    candidates: { profile_id: string; full_name: string; address: string | null }[];
}) {
    const [state, formAction] = useActionState<EstateActionState, FormData>(action, null);
    const formRef = useRef<HTMLFormElement>(null);

    useEffect(() => {
        if (!state) return;
        if (state.success) {
            toast.success("Customer promoted to an estate");
            formRef.current?.reset();
        } else if (state.error) {
            toast.error(state.error);
        }
    }, [state]);

    if (candidates.length === 0) {
        return (
            <p className="text-sm text-white/40">
                No eligible customers to promote yet — an estate must first sign up and be approved as a regular customer.
            </p>
        );
    }

    return (
        <form ref={formRef} action={formAction} className="flex flex-col gap-3 sm:flex-row">
            <select
                name="profileId"
                required
                defaultValue=""
                className="h-11 w-full rounded-xl border border-white/10 bg-[#141518] px-3 text-sm text-white outline-none sm:flex-1"
            >
                <option value="" disabled>
                    Select customer to promote
                </option>
                {candidates.map((c) => (
                    <option key={c.profile_id} value={c.profile_id}>
                        {c.full_name} {c.address ? `— ${c.address}` : ""}
                    </option>
                ))}
            </select>
            <SubmitButton />
        </form>
    );
}
