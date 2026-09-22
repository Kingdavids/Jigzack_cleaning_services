'use client';

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import type { TaskActionState } from "@/app/admin/actions";

function SubmitButton() {
    const { pending } = useFormStatus();

    return (
        <button
            type="submit"
            disabled={pending}
            className="w-full rounded-2xl bg-amber-400 px-4 py-2.5 font-bold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
            {pending ? "Assigning…" : "Assign Task"}
        </button>
    );
}

export default function AssignTaskForm({
                                            action,
                                            children,
                                        }: {
    action: (prevState: TaskActionState, formData: FormData) => Promise<TaskActionState>;
    children: React.ReactNode;
}) {
    const [state, formAction] = useActionState<TaskActionState, FormData>(action, null);
    const formRef = useRef<HTMLFormElement>(null);

    useEffect(() => {
        if (!state) return;

        if (state.success) {
            toast.success("Task assigned");
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
            <p className="text-xs uppercase tracking-[0.2em] text-white/45">Assign new task</p>
            {children}
            <SubmitButton />
        </form>
    );
}
