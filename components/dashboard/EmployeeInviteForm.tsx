'use client';

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import type { InviteActionState } from "@/app/admin/actions";

function SubmitButton() {
    const { pending } = useFormStatus();
    return (
        <button
            type="submit"
            disabled={pending}
            className="rounded-xl bg-amber-400 px-4 py-2.5 font-bold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
            {pending ? "Creating…" : "Create invite link"}
        </button>
    );
}

export default function EmployeeInviteForm({
                                                action,
                                            }: {
    action: (prevState: InviteActionState, formData: FormData) => Promise<InviteActionState>;
}) {
    const [state, formAction] = useActionState<InviteActionState, FormData>(action, null);
    const formRef = useRef<HTMLFormElement>(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!state) return;

        if (state.success) {
            toast.success(state.emailed ? "Invite created and emailed" : "Invite created");
            formRef.current?.reset();
        } else if (state.error) {
            toast.error(state.error);
        }
    }, [state]);

    const copyLink = async () => {
        if (!state?.link) return;
        await navigator.clipboard.writeText(state.link);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="space-y-4">
            <form ref={formRef} action={formAction} className="flex flex-col gap-3 sm:flex-row">
                <input
                    type="email"
                    name="email"
                    placeholder="Employee's email (optional, locks the invite to it)"
                    className="h-11 w-full rounded-xl border border-white/10 bg-white/8 px-3 text-sm text-white outline-none placeholder:text-white/30 sm:flex-1"
                />
                <SubmitButton />
            </form>

            {state?.success && state.link && (
                <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-emerald-300">
                        Invite link (works once, expires in 7 days)
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                        <code className="min-w-0 flex-1 truncate rounded-lg bg-black/30 px-3 py-2 text-xs text-white/80">
                            {state.link}
                        </code>
                        <button
                            type="button"
                            onClick={copyLink}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/10"
                        >
                            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                            {copied ? "Copied" : "Copy"}
                        </button>
                    </div>
                    {state.emailed && <p className="mt-2 text-xs text-emerald-200/80">Also sent to the email above.</p>}
                </div>
            )}
        </div>
    );
}
