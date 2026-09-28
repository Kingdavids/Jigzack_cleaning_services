'use client';

import { useState } from "react";
import { toast } from "sonner";
import { emailCustomer } from "@/app/admin/actions";

// A one-off email to this customer's inbox, sent from the site's own address,
// separate from the in-app message thread. Handy when they may not open the
// app but do check their email.
export default function EmailCustomerForm({ profileId, email }: { profileId: string; email: string | null }) {
    const [subject, setSubject] = useState("");
    const [body, setBody] = useState("");
    const [busy, setBusy] = useState(false);

    if (!email) {
        return <p className="text-sm text-white/50">This customer has no email address on file.</p>;
    }

    const send = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (busy) return;

        setBusy(true);
        const result = await emailCustomer(profileId, subject, body);
        setBusy(false);

        if (!result.success) {
            toast.error(result.error ?? "Could not send the email.");
            return;
        }

        toast.success(result.message ?? "Email sent");
        setSubject("");
        setBody("");
    };

    return (
        <form onSubmit={send} className="space-y-3">
            <p className="text-xs text-white/50">Sends to {email}, from your domain address, not an in-app message.</p>
            <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Subject"
                required
                maxLength={200}
                className="h-11 w-full rounded-xl border border-white/10 bg-white/8 px-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-amber-300/50"
            />
            <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Message"
                required
                maxLength={5000}
                className="min-h-[110px] w-full rounded-xl border border-white/10 bg-white/8 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-amber-300/50"
            />
            <button
                type="submit"
                disabled={busy}
                className="h-11 w-full rounded-xl bg-amber-400 px-4 font-bold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
                {busy ? "Sending…" : "Send email"}
            </button>
        </form>
    );
}
