'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { changeAdminAccess, revokeAdminInvite } from "@/app/admin/team-actions";

type Mode = "admin" | "supervisor" | "remove";

// Buttons for one admin account. The database and the server both refuse to
// remove the last full admin, so these cannot lock everyone out.
export function AdminAccessButtons({
                                       userId,
                                       isViewOnly,
                                       isRemoved,
                                       isSelf,
                                   }: {
    userId: string;
    isViewOnly: boolean;
    isRemoved: boolean;
    isSelf: boolean;
}) {
    const router = useRouter();
    const [busy, setBusy] = useState<Mode | null>(null);

    if (isSelf) return <span className="text-xs text-white/40">This is you</span>;

    const run = async (mode: Mode, confirmText?: string) => {
        if (confirmText && !window.confirm(confirmText)) return;

        setBusy(mode);
        const result = await changeAdminAccess(userId, mode);
        setBusy(null);

        if (!result.success) {
            toast.error(result.error ?? "Something went wrong.");
            return;
        }

        toast.success("Access updated");
        router.refresh();
    };

    const base = "rounded-lg px-3 py-1.5 text-xs font-bold transition disabled:opacity-50";

    return (
        <div className="flex flex-wrap gap-2">
            {isRemoved ? (
                <button
                    disabled={busy !== null}
                    onClick={() => run("admin")}
                    className={`${base} border border-emerald-400/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20`}
                >
                    Restore as full admin
                </button>
            ) : (
                <>
                    {isViewOnly ? (
                        <button
                            disabled={busy !== null}
                            onClick={() => run("admin", "Give this person full admin access?")}
                            className={`${base} border border-white/15 bg-white/5 text-white hover:bg-white/10`}
                        >
                            Make full admin
                        </button>
                    ) : (
                        <button
                            disabled={busy !== null}
                            onClick={() => run("supervisor", "Make this person view-only? They will keep seeing everything but lose the ability to change anything.")}
                            className={`${base} border border-white/15 bg-white/5 text-white hover:bg-white/10`}
                        >
                            Make view-only
                        </button>
                    )}
                    <button
                        disabled={busy !== null}
                        onClick={() => run("remove", "Remove this person's admin access? They will no longer be able to open the admin area.")}
                        className={`${base} border border-red-400/30 bg-red-500/10 text-red-300 hover:bg-red-500/20`}
                    >
                        Remove access
                    </button>
                </>
            )}
        </div>
    );
}

export function AdminInviteButtons({ inviteId, link }: { inviteId: string; link: string }) {
    const router = useRouter();
    const [copied, setCopied] = useState(false);
    const [busy, setBusy] = useState(false);

    const copy = async () => {
        await navigator.clipboard.writeText(link);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const revoke = async () => {
        if (!window.confirm("Revoke this invite? The link will stop working.")) return;

        setBusy(true);
        const result = await revokeAdminInvite(inviteId);
        setBusy(false);

        if (!result.success) {
            toast.error(result.error ?? "Something went wrong.");
            return;
        }

        toast.success("Invite revoked");
        router.refresh();
    };

    return (
        <div className="flex gap-2">
            <button
                onClick={copy}
                className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/10"
            >
                {copied ? "Copied" : "Copy link"}
            </button>
            <button
                disabled={busy}
                onClick={revoke}
                className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-300 hover:bg-red-500/20 disabled:opacity-50"
            >
                Revoke
            </button>
        </div>
    );
}
