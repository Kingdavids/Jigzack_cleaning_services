'use client';

import { useState, useTransition } from "react";
import { Check, Copy, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { revokeEmployeeInvite } from "@/app/admin/actions";

export default function InviteRowActions({ inviteId, token }: { inviteId: string; token: string }) {
    const [copied, setCopied] = useState(false);
    const [pending, startTransition] = useTransition();

    const copy = async () => {
        await navigator.clipboard.writeText(`${window.location.origin}/auth/employee-invite?token=${token}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const revoke = () => {
        if (!confirm("Revoke this invite? The link will stop working.")) return;

        startTransition(async () => {
            await revokeEmployeeInvite(inviteId);
            toast.success("Invite revoked");
        });
    };

    return (
        <div className="flex items-center gap-2">
            <button
                type="button"
                onClick={copy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/10"
            >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy link"}
            </button>
            <button
                type="button"
                onClick={revoke}
                disabled={pending}
                aria-label="Revoke invite"
                className="rounded-lg border border-red-400/20 bg-red-500/10 p-2 text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
            >
                <Trash2 className="h-3.5 w-3.5" />
            </button>
        </div>
    );
}
