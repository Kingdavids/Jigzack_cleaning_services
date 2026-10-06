'use client';

import { useState } from "react";
import { toast } from "sonner";
import { emailCustomer } from "@/app/admin/actions/messages";

// A compact "Email" button that opens a subject and message inline, for
// someone with no customer record yet to open (a signup with no details). It
// uses the same one-off email as a full customer page, addressed by profile id.
export default function EmailProfileButton({ profileId, email }: { profileId: string; email: string | null }) {
    const [open, setOpen] = useState(false);
    const [subject, setSubject] = useState("");
    const [body, setBody] = useState("");
    const [busy, setBusy] = useState(false);

    if (!email) return null;

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
        setOpen(false);
    };

    if (!open) {
        return (
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="text-xs font-semibold text-amber-300 underline underline-offset-2"
            >
                Email
            </button>
        );
    }

    return (
        <form onSubmit={send} className="mt-3 w-full space-y-2 rounded-xl border border-white/10 bg-black/25 p-4">
            <p className="text-xs text-white/50">Sends to {email}, from your domain address.</p>
            <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Subject"
                required
                maxLength={200}
                className="h-10 w-full rounded-lg border border-white/10 bg-white/8 px-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-amber-300/50"
            />
            <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Message"
                required
                maxLength={5000}
                className="min-h-[90px] w-full rounded-lg border border-white/10 bg-white/8 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-amber-300/50"
            />
            <div className="flex gap-2">
                <button
                    type="submit"
                    disabled={busy}
                    className="rounded-lg bg-amber-400 px-4 py-2 text-xs font-bold text-black hover:bg-amber-300 disabled:opacity-60"
                >
                    {busy ? "Sending..." : "Send"}
                </button>
                <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-lg border border-white/15 px-4 py-2 text-xs font-semibold text-white/80 hover:bg-white/10"
                >
                    Cancel
                </button>
            </div>
        </form>
    );
}
