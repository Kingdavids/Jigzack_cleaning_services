'use client';

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { ADMIN_SEARCH_INDEX, type SearchEntry } from "@/lib/dashboard/searchIndex";

function matches(entry: SearchEntry, query: string) {
    const haystack = `${entry.label} ${entry.description} ${entry.keywords.join(" ")}`.toLowerCase();
    return query
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .every((word) => haystack.includes(word));
}

// Finds a page or feature by name instead of hunting through the sidebar.
// Opens with the search button in the topbar, or Ctrl/Cmd+K from anywhere.
export default function DashboardSearch() {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [highlighted, setHighlighted] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);

    const results = useMemo(() => {
        const list = query.trim() ? ADMIN_SEARCH_INDEX.filter((entry) => matches(entry, query)) : ADMIN_SEARCH_INDEX;
        return list.slice(0, 8);
    }, [query]);

    const changeQuery = (value: string) => {
        setQuery(value);
        setHighlighted(0);
    };

    const close = () => {
        setOpen(false);
        setQuery("");
        setHighlighted(0);
    };

    const go = (entry: SearchEntry) => {
        router.push(entry.href);
        close();
    };

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
                event.preventDefault();
                setOpen(true);
            } else if (event.key === "Escape" && open) {
                close();
            }
        };

        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open]);

    useEffect(() => {
        if (open) inputRef.current?.focus();
    }, [open]);

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="hidden items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white/60 transition hover:bg-white/10 hover:text-white sm:flex"
            >
                <Search size={16} />
                <span>Search</span>
                <kbd className="ml-2 rounded border border-white/15 bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold text-white/40">Ctrl K</kbd>
            </button>

            <button
                type="button"
                onClick={() => setOpen(true)}
                aria-label="Search the dashboard"
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/80 transition hover:bg-white/10 sm:hidden"
            >
                <Search size={18} />
            </button>

            {open &&
                typeof document !== "undefined" &&
                createPortal(
                    <div className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[10vh]" role="presentation">
                        <div className="absolute inset-0 bg-black/70" onClick={close} aria-hidden="true" />

                        <div
                            role="dialog"
                            aria-modal="true"
                            className="relative w-full max-w-lg rounded-2xl border border-white/10 bg-[#141518] shadow-2xl"
                        >
                            <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
                                <Search size={18} className="shrink-0 text-white/40" />
                                <input
                                    ref={inputRef}
                                    value={query}
                                    onChange={(e) => changeQuery(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "ArrowDown") {
                                            e.preventDefault();
                                            setHighlighted((h) => Math.min(h + 1, results.length - 1));
                                        } else if (e.key === "ArrowUp") {
                                            e.preventDefault();
                                            setHighlighted((h) => Math.max(h - 1, 0));
                                        } else if (e.key === "Enter" && results[highlighted]) {
                                            go(results[highlighted]);
                                        }
                                    }}
                                    placeholder="Find a page or feature: discount, arrears, estates, broadcast..."
                                    className="h-8 w-full bg-transparent text-sm text-white outline-none placeholder:text-white/30"
                                />
                                <kbd className="shrink-0 rounded border border-white/15 bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold text-white/40">
                                    Esc
                                </kbd>
                            </div>

                            <div className="max-h-[50vh] overflow-y-auto p-2">
                                {results.length === 0 ? (
                                    <p className="px-3 py-6 text-center text-sm text-white/40">Nothing matches &quot;{query}&quot;.</p>
                                ) : (
                                    results.map((entry, index) => (
                                        <button
                                            key={entry.label}
                                            type="button"
                                            onClick={() => go(entry)}
                                            onMouseEnter={() => setHighlighted(index)}
                                            className={`block w-full rounded-xl px-3 py-2.5 text-left transition ${
                                                index === highlighted ? "bg-amber-400/15" : "hover:bg-white/[0.05]"
                                            }`}
                                        >
                                            <p className={`text-sm font-semibold ${index === highlighted ? "text-amber-300" : "text-white"}`}>
                                                {entry.label}
                                            </p>
                                            <p className="mt-0.5 text-xs text-white/50">{entry.description}</p>
                                        </button>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>,
                    document.body
                )}
        </>
    );
}
