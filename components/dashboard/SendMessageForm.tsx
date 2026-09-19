'use client';

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import type { MessageActionState } from "@/lib/messaging-actions";

function SubmitButton() {
    const { pending } = useFormStatus();

    return (
        <button
            type="submit"
            disabled={pending}
            className="w-full rounded-xl bg-amber-400 px-4 py-2.5 font-bold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
            {pending ? "Sending…" : "Send Message"}
        </button>
    );
}

export default function SendMessageForm({
                                             action,
                                             label,
                                             children,
                                         }: {
    action: (prevState: MessageActionState, formData: FormData) => Promise<MessageActionState>;
    label: string;
    children: React.ReactNode;
}) {
    const [state, formAction] = useActionState<MessageActionState, FormData>(action, null);
    const formRef = useRef<HTMLFormElement>(null);

    useEffect(() => {
        if (!state) return;

        if (state.success) {
            toast.success("Message sent");
            formRef.current?.reset();
        } else if (state.error) {
            toast.error(state.error);
        }
    }, [state]);

    return (
        <form
            ref={formRef}
            action={formAction}
            className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-4"
        >
            <p className="text-xs uppercase tracking-[0.2em] text-white/45">{label}</p>
            {children}
            <SubmitButton />
        </form>
    );
}
