'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { clearActivityLog } from "@/app/admin/cleanup-actions";

type Scope = "older30" | "older90" | "all";

// Owner only. Clearing older entries is the everyday choice; clearing
// everything needs DELETE typed. Either way a new entry records that it happened.
export default function ClearActivityCard() {
    const router = useRouter();
    const [scope, setScope] = useState<Scope>("older90");
    const [typed, setTyped] = useState("");
    const [busy, setBusy] = useState(false);

    const clear = async () => {
        if (scope !== "all" && !window.confirm("Clear these activity entries for good?")) return;

        setBusy(true);
        const result = await clearActivityLog(scope, typed);
        setBusy(false);

        if (!result.success) {
            toast.error(result.error ?? "Something went wrong.");
            return;
        }

        toast.success(`Cleared ${result.deleted ?? 0} entr${result.deleted === 1 ? "y" : "ies"}`);
        setTyped("");
        router.refresh();
    };

    return (
        <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <select
                    value={scope}
                    onChange={(e) => setScope(e.target.value as Scope)}
                    aria-label="What to clear"
                    className="h-11 rounded-xl border border-white/10 bg-[#141518] px-3 text-sm text-white outline-none"
                >
                    <option value="older90">Entries older than 90 days</option>
                    <option value="older30">Entries older than 30 days</option>
                    <option value="all">Everything</option>
                </select>
                <button
                    disabled={busy || (scope === "all" && typed.trim() !== "DELETE")}
                    onClick={clear}
                    className="h-11 rounded-xl border border-red-400/40 bg-red-500/10 px-5 text-sm font-bold text-red-300 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                >
                    {busy ? "Clearing..." : "Clear"}
                </button>
            </div>

            {scope === "all" && (
                <div>
                    <label htmlFor="clear-activity" className="mb-1 block text-sm text-white/80">
                        Type <span className="font-bold text-white">DELETE</span> to confirm.
                    </label>
                    <input
                        id="clear-activity"
                        value={typed}
                        onChange={(e) => setTyped(e.target.value)}
                        autoComplete="off"
                        className="h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-red-300/50"
                    />
                </div>
            )}

            <p className="text-xs text-white/45">
                The log is how you see who changed what. Clearing it cannot be undone, and a new entry records that you cleared it.
            </p>
        </div>
    );
}
