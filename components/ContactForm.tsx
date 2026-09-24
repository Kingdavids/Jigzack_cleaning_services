'use client';

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { sendContactMessage, type ContactState } from "@/app/contact/actions";
import { trackEvent } from "@/lib/analytics";

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
    // The success panel is derived from the latest result; "send another"
    // just remembers which result was already dismissed.
    const [dismissed, setDismissed] = useState<ContactState>(null);
    const sent = Boolean(state?.success) && state !== dismissed;

    useEffect(() => {
        if (state && !state.success && state.error) toast.error(state.error);
        if (state?.success) trackEvent("generate_lead", { method: "contact_form" });
    }, [state]);

    if (sent) {
        return (
            <div
                role="status"
                className="animate-successIn mt-6 flex flex-col items-center rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.07] px-6 py-12 text-center"
            >
                <svg viewBox="0 0 64 64" className="h-20 w-20" fill="none" aria-hidden="true">
                    <circle
                        className="check-circle"
                        cx="32"
                        cy="32"
                        r="28"
                        stroke="#34d399"
                        strokeWidth="3"
                        strokeLinecap="round"
                    />
                    <path
                        className="check-mark"
                        d="M20 33 L28 41 L44 23"
                        stroke="#34d399"
                        strokeWidth="4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </svg>

                <h4 className="animate-successIn mt-5 text-2xl font-black [animation-delay:600ms]">Message sent</h4>
                <p className="animate-successIn mt-2 max-w-xs text-white/70 [animation-delay:750ms]">
                    Thank you for reaching out. We&apos;ll get back to you shortly.
                </p>

                <button
                    type="button"
                    onClick={() => setDismissed(state)}
                    className="animate-successIn mt-6 rounded-xl border border-white/15 bg-white/[0.05] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10 [animation-delay:900ms]"
                >
                    Send another message
                </button>
            </div>
        );
    }

    return (
        <form action={formAction} className="mt-6 grid gap-4">
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
