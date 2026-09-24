'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteAllMessages } from "@/app/admin/cleanup-actions";

// Owner only: erase every message in the system, for clearing out test data.
export default function ClearMessagesCard() {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [typed, setTyped] = useState("");
    const [busy, setBusy] = useState(false);

    const clear = async () => {
        setBusy(true);
        const result = await deleteAllMessages(typed);
        setBusy(false);

        if (!result.success) {
            toast.error(result.error ?? "Something went wrong.");
            return;
        }

        toast.success(`Deleted ${result.deleted ?? 0} message${result.deleted === 1 ? "" : "s"}`);
        setOpen(false);
        setTyped("");
        router.refresh();
    };

    return (
        <div className="rounded-2xl border border-red-400/25 bg-red-500/[0.05] p-4">
            <p className="font-bold text-red-200">Delete every message</p>
            <p className="mt-1 text-sm text-red-100/70">
                Removes all messages between everyone: admins, staff and customers. This cannot be undone. Use it to clear out test messages.
            </p>

            {!open ? (
                <button
                    onClick={() => setOpen(true)}
                    className="mt-3 rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-2 text-sm font-bold text-red-300 hover:bg-red-500/20"
                >
                    Delete all messages
                </button>
            ) : (
                <div className="mt-3 space-y-3">
                    <label htmlFor="clear-messages" className="block text-sm text-white/80">
                        Type <span className="font-bold text-white">DELETE</span> to confirm.
                    </label>
                    <input
                        id="clear-messages"
                        value={typed}
                        onChange={(e) => setTyped(e.target.value)}
                        autoComplete="off"
                        className="h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-red-300/50"
                    />
                    <div className="flex gap-3">
                        <button
                            disabled={busy || typed.trim() !== "DELETE"}
                            onClick={clear}
                            className="rounded-xl bg-red-500 px-4 py-2 text-sm font-bold text-white hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            {busy ? "Deleting..." : "Delete all messages"}
                        </button>
                        <button
                            onClick={() => {
                                setOpen(false);
                                setTyped("");
                            }}
                            className="rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white/80 hover:bg-white/10"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
