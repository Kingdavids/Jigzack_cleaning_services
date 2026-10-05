'use client';

import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// The furthest apart the first and last month can be.
export const MAX_MONTHS = 24;

// "YYYY-MM" <-> a running month number, so ranges are simple arithmetic.
export const toIndex = (key: string) => {
    const [y, m] = key.split("-").map(Number);
    return y * 12 + (m - 1);
};
export const toKey = (index: number) => `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;

const longName = (key: string) => {
    const [y, m] = key.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, 15)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
};

// The number of months from start to end, inclusive.
export const monthSpan = (start: string, end: string) => Math.max(1, toIndex(end) - toIndex(start) + 1);

// A month field that folds open into a calendar of the year's months. Picking
// one closes it again. Months outside min..max can't be picked.
export function MonthField({
                               label,
                               value,
                               onChange,
                               min,
                               max,
                           }: {
    label: string;
    // "YYYY-MM"
    value: string;
    onChange: (value: string) => void;
    min?: string;
    max?: string;
}) {
    const [open, setOpen] = useState(false);
    const [year, setYear] = useState(Number(value.slice(0, 4)));
    const ref = useRef<HTMLDivElement>(null);

    const selected = toIndex(value);
    const lowest = min ? toIndex(min) : -Infinity;
    const highest = max ? toIndex(max) : Infinity;

    // Closes when clicking anywhere else, or on Escape.
    useEffect(() => {
        if (!open) return;

        const onPointer = (e: PointerEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
        };

        document.addEventListener("pointerdown", onPointer);
        document.addEventListener("keydown", onKey);

        return () => {
            document.removeEventListener("pointerdown", onPointer);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

    const toggle = () => {
        // Opens on the year of the month already chosen.
        if (!open) setYear(Number(value.slice(0, 4)));
        setOpen((v) => !v);
    };

    return (
        <div ref={ref} className="relative w-full sm:w-60">
            <span className="mb-1 block text-[11px] uppercase tracking-[0.12em] text-white/40">{label}</span>
            <button
                type="button"
                onClick={toggle}
                aria-expanded={open}
                aria-label={`${label}: ${longName(value)}`}
                className="flex h-11 w-full items-center gap-2 rounded-xl border border-white/10 bg-white/8 px-3 text-left text-sm text-white outline-none transition hover:border-white/20 focus:border-amber-300/50"
            >
                <CalendarDays className="h-4 w-4 shrink-0 text-white/50" />
                <span className="flex-1">{longName(value)}</span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-white/40 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>

            {open && (
                <div className="absolute left-0 right-0 top-full z-20 mt-2 rounded-2xl border border-white/10 bg-[#141518] p-3 shadow-2xl sm:right-auto sm:w-72">
                    <div className="mb-2 flex items-center justify-between">
                        <button
                            type="button"
                            onClick={() => setYear((y) => y - 1)}
                            disabled={year * 12 + 11 < lowest}
                            aria-label="Previous year"
                            className="flex h-9 w-9 items-center justify-center rounded-lg text-white/70 transition hover:bg-white/10 hover:text-white disabled:opacity-30"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                        <p className="text-sm font-bold">{year}</p>
                        <button
                            type="button"
                            onClick={() => setYear((y) => y + 1)}
                            disabled={(year + 1) * 12 > highest}
                            aria-label="Next year"
                            className="flex h-9 w-9 items-center justify-center rounded-lg text-white/70 transition hover:bg-white/10 hover:text-white disabled:opacity-30"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    </div>

                    <div className="grid grid-cols-4 gap-1.5" role="group" aria-label={`Months in ${year}`}>
                        {MONTHS.map((name, i) => {
                            const index = year * 12 + i;
                            const isSelected = index === selected;
                            const allowed = index >= lowest && index <= highest;

                            return (
                                <button
                                    key={name}
                                    type="button"
                                    disabled={!allowed}
                                    onClick={() => {
                                        onChange(toKey(index));
                                        setOpen(false);
                                    }}
                                    aria-pressed={isSelected}
                                    className={`h-10 rounded-lg text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-25 ${
                                        isSelected ? "bg-amber-400 text-black" : "text-white/70 hover:bg-white/10 hover:text-white"
                                    }`}
                                >
                                    {name}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

// The first and last month an invoice covers, each picked from its own calendar.
// The last month can't be before the first, nor more than MAX_MONTHS after it.
export default function MonthRangePicker({
                                             start,
                                             end,
                                             onChange,
                                             latestStart,
                                         }: {
    start: string;
    end: string;
    onChange: (range: { start: string; end: string }) => void;
    // The latest month a range may start in ("YYYY-MM"): the billing month,
    // since a month isn't billed before its invoices start on the 25th.
    latestStart?: string;
}) {
    const changeStart = (value: string) => {
        const from = toIndex(value);
        // Keeps the last month on or after the first, and within the limit.
        const to = Math.min(Math.max(toIndex(end), from), from + MAX_MONTHS - 1);
        onChange({ start: value, end: toKey(to) });
    };

    return (
        <div className="flex flex-col gap-3 sm:flex-row">
            <MonthField label="From" value={start} onChange={changeStart} max={latestStart} />
            <MonthField
                label="To"
                value={end}
                onChange={(value) => onChange({ start, end: value })}
                min={start}
                max={toKey(toIndex(start) + MAX_MONTHS - 1)}
            />
        </div>
    );
}
