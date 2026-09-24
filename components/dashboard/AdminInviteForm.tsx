'use client';

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Copy } from "lucide-react";
import { createAdminInvite, type AdminInviteState } from "@/app/admin/team-actions";

function SubmitButton() {
    const { pending } = useFormStatus();

    return (
        <button
            type="submit"
            disabled={pending}
            className="h-11 rounded-xl bg-amber-400 px-5 text-sm font-bold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
            {pending ? "Creating..." : "Create invite"}
        </button>
    );
}

// Creates a single-use invite link tied to one email address, and shows it so
// it can also be sent by hand.
export default function AdminInviteForm() {
    const [state, formAction] = useActionState<AdminInviteState, FormData>(createAdminInvite, null);
    const [copied, setCopied] = useState(false);

    const copy = async () => {
        if (!state?.link) return;
        await navigator.clipboard.writeText(state.link);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="space-y-4">
            <form action={formAction} className="grid gap-3 sm:grid-cols-[1fr_190px_auto]">
                <input
                    name="email"
                    type="email"
                    required
                    aria-label="Email address"
                    placeholder="Their email address"
                    className="h-11 rounded-xl border border-white/10 bg-white/8 px-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-amber-300/50"
                />
                <select
                    name="kind"
                    defaultValue="admin"
                    aria-label="Access level"
                    className="h-11 rounded-xl border border-white/10 bg-[#141518] px-3 text-sm text-white outline-none"
                >
                    <option value="admin">Full admin</option>
                    <option value="supervisor">Supervisor (view only)</option>
                </select>
                <SubmitButton />
            </form>

            {state && !state.success && state.error && (
                <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{state.error}</p>
            )}

            {state?.success && state.link && (
                <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/[0.07] p-4">
                    <p className="text-sm font-semibold text-emerald-300">
                        Invite created. {state.emailed ? "We emailed it to them." : "It was not emailed, so send them this link yourself."}
                    </p>
                    <p className="mt-2 break-all rounded-lg bg-black/30 px-3 py-2 font-mono text-xs text-white/80">{state.link}</p>
                    <button
                        type="button"
                        onClick={copy}
                        className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
                    >
                        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        {copied ? "Copied" : "Copy link"}
                    </button>
                </div>
            )}
        </div>
    );
}
