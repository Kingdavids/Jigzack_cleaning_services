'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

type BulkAction = (ids: string[], confirm: string) => Promise<{ success: boolean; error?: string; deleted?: number }>;

type Ctx = {
    selected: Set<string>;
    toggle: (id: string) => void;
    setAll: (ids: string[], on: boolean) => void;
    clear: () => void;
    allIds: string[];
};

const BulkContext = createContext<Ctx | null>(null);

// Wraps a list so its rows can be ticked and deleted together. Only rendered
// for people who are allowed to delete, and the server checks again.
export function BulkSelectProvider({
                                       children,
                                       allIds,
                                       action,
                                       noun,
                                       paidIds = [],
                                       enabled = true,
                                   }: {
    children: ReactNode;
    allIds: string[];
    action: BulkAction;
    noun: string;
    // Rows that need the word DELETE typed before they can go (paid invoices).
    paidIds?: string[];
    // False for people who may not delete: the list then shows no tick boxes.
    enabled?: boolean;
}) {
    const router = useRouter();
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [busy, setBusy] = useState(false);

    const toggle = useCallback((id: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const setAll = useCallback((ids: string[], on: boolean) => setSelected(on ? new Set(ids) : new Set()), []);
    const clear = useCallback(() => setSelected(new Set()), []);

    const value = useMemo(() => ({ selected, toggle, setAll, clear, allIds }), [selected, toggle, setAll, clear, allIds]);

    const remove = async () => {
        const ids = [...selected];
        if (ids.length === 0) return;

        const needsWord = ids.some((id) => paidIds.includes(id));
        let confirmText = "";

        if (needsWord) {
            const typed = window.prompt(`Some of these ${noun}s are already paid. This cannot be undone. Type DELETE to confirm.`);
            if (typed === null) return;
            confirmText = typed;
        } else if (!window.confirm(`Delete ${ids.length} ${noun}${ids.length === 1 ? "" : "s"} for good? This cannot be undone.`)) {
            return;
        }

        setBusy(true);
        const result = await action(ids, confirmText);
        setBusy(false);

        if (!result.success) {
            toast.error(result.error ?? "Something went wrong.");
            return;
        }

        toast.success(`Deleted ${result.deleted ?? ids.length} ${noun}${(result.deleted ?? ids.length) === 1 ? "" : "s"}`);
        clear();
        router.refresh();
    };

    const allTicked = allIds.length > 0 && selected.size === allIds.length;

    if (!enabled) return <>{children}</>;

    return (
        <BulkContext.Provider value={value}>
            <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                <label className="flex items-center gap-2 text-xs font-semibold text-white/70">
                    <input
                        type="checkbox"
                        checked={allTicked}
                        onChange={(e) => setAll(allIds, e.target.checked)}
                        className="h-4 w-4 accent-amber-400"
                    />
                    Select all
                </label>
                <span className="text-xs text-white/45">{selected.size} selected</span>
                <button
                    type="button"
                    disabled={busy || selected.size === 0}
                    onClick={remove}
                    className="ml-auto rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-300 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                >
                    {busy ? "Deleting..." : "Delete selected"}
                </button>
            </div>
            {children}
        </BulkContext.Provider>
    );
}

// The tick box that goes on one row.
export function BulkCheckbox({ id, label = "Select" }: { id: string; label?: string }) {
    const ctx = useContext(BulkContext);
    if (!ctx) return null;

    return (
        <input
            type="checkbox"
            aria-label={label}
            checked={ctx.selected.has(id)}
            onChange={() => ctx.toggle(id)}
            className="mt-1 h-4 w-4 shrink-0 accent-amber-400"
        />
    );
}
