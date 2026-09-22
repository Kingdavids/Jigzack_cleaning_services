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
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
        >
            {pending ? "Adding…" : "Add unit"}
        </button>
    );
}

export default function AddUnitForm({
                                         action,
                                         estateProfileId,
                                     }: {
    action: (prevState: EstateActionState, formData: FormData) => Promise<EstateActionState>;
    estateProfileId: string;
}) {
    const [state, formAction] = useActionState<EstateActionState, FormData>(action, null);
    const formRef = useRef<HTMLFormElement>(null);

    useEffect(() => {
        if (!state) return;
        if (state.success) {
            toast.success("Unit added");
            formRef.current?.reset();
        } else if (state.error) {
            toast.error(state.error);
        }
    }, [state]);

    return (
        <form ref={formRef} action={formAction} className="flex gap-2">
            <input type="hidden" name="estateProfileId" value={estateProfileId} />
            <input
                name="label"
                placeholder="Unit label, e.g. Block A - Flat 4"
                required
                className="h-10 flex-1 rounded-lg border border-white/10 bg-white/8 px-3 text-sm text-white outline-none placeholder:text-white/30"
            />
            <SubmitButton />
        </form>
    );
}
