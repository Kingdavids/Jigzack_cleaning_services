'use client';

import { createContext, useContext, useState, type ReactNode } from "react";
import { ChevronDown, Search } from "lucide-react";

const FilterContext = createContext({ query: "", onlyNeeds: false });

// A search box and a "needs a driver" switch above the customer groups.
export function TaskFilter({ children }: { children: ReactNode }) {
    const [query, setQuery] = useState("");
    const [onlyNeeds, setOnlyNeeds] = useState(false);

    return (
        <FilterContext.Provider value={{ query: query.trim().toLowerCase(), onlyNeeds }}>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                <label className="relative block flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                    <span className="sr-only">Search customers</span>
                    <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search by customer"
                        className="h-12 w-full rounded-xl border border-white/10 bg-white/8 pl-10 pr-3 text-base text-white outline-none placeholder:text-white/30 focus:border-amber-300/50 sm:h-11 sm:text-sm"
                    />
                </label>
                <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm text-white/70">
                    <input
                        type="checkbox"
                        checked={onlyNeeds}
                        onChange={(e) => setOnlyNeeds(e.target.checked)}
                        className="h-4 w-4 accent-amber-400"
                    />
                    Only customers with pickups that need assigning
                </label>
            </div>
            <div className="space-y-4">{children}</div>
        </FilterContext.Provider>
    );
}

// One customer and their pickups, folded away until opened.
export function TaskGroup({
                              name,
                              needs,
                              defaultOpen,
                              header,
                              children,
                          }: {
    name: string;
    // How many of their pickups still need someone assigned.
    needs: number;
    defaultOpen: boolean;
    header: ReactNode;
    children: ReactNode;
}) {
    const { query, onlyNeeds } = useContext(FilterContext);

    if (query && !name.toLowerCase().includes(query)) return null;
    if (onlyNeeds && needs === 0) return null;

    return (
        <details open={defaultOpen || Boolean(query)} className="group rounded-3xl border border-white/10 bg-white/[0.02]">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 sm:p-5 [&::-webkit-details-marker]:hidden">
                <div className="min-w-0 flex-1">{header}</div>
                <ChevronDown className="h-5 w-5 shrink-0 text-white/40 transition-transform group-open:rotate-180" />
            </summary>
            <div className="space-y-3 border-t border-white/10 p-3 sm:p-4">{children}</div>
        </details>
    );
}
