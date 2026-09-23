'use client';

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { sendContactMessage, type ContactState } from "@/app/contact/actions";

function SubmitButton() {
    const { pending } = useFormStatus();

    return (
        <button
            type="submit"
            disabled={pending}
            className="w-full rounded-2xl bg-amber-400 px-5 py-3 font-bold text-black shadow-lg transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
            {pending ? "Sending…" : "Send message"}
        </button>
    );
}

const fieldClass =
    "w-full rounded-xl border border-white/10 bg-white/8 px-4 py-3 text-white outline-none transition placeholder:text-white/35 focus:border-amber-300/50 focus:bg-white/10";

export default function ContactForm() {
    const [state, formAction] = useActionState<ContactState, FormData>(sendContactMessage, null);
    const formRef = useRef<HTMLFormElement>(null);

    useEffect(() => {
        if (!state) return;

        if (state.success) {
            toast.success("Message sent. We'll get back to you soon.");
            formRef.current?.reset();
        } else if (state.error) {
            toast.error(state.error);
        }
    }, [state]);

    return (
        <form ref={formRef} action={formAction} className="mt-6 grid gap-4">
            {/* Honeypot: hidden from people, filled in by bots. */}
            <input
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="absolute left-[-9999px] h-0 w-0 opacity-0"
            />

            <input name="name" required placeholder="Your name" autoComplete="name" className={fieldClass} />

            <div className="grid gap-4 sm:grid-cols-2">
                <input name="email" type="email" placeholder="Email address" autoComplete="email" className={fieldClass} />
                <input name="phone" type="tel" placeholder="Phone number" autoComplete="tel" className={fieldClass} />
            </div>

            <textarea
                name="message"
                required
                placeholder="What do you need? For example a pickup plan for your home, a quote for a business, or an awareness session."
                className={`${fieldClass} min-h-[140px] resize-y`}
            />

            <SubmitButton />
        </form>
    );
}
