'use client';

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// The furthest apart the first and last month can be.
export const MAX_MONTHS = 24;

// "YYYY-MM" <-> a running month number, so ranges are simple arithmetic.
const toIndex = (key: string) => {
    const [y, m] = key.split("-").map(Number);
    return y * 12 + (m - 1);
};
const toKey = (index: number) => `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;

// A year of months to pick a range from: click the first month, then the last.
// Arrows move between years, so a range can run over New Year.
export default function MonthRangePicker({
                                             start,
                                             end,
                                             onChange,
                                         }: {
    // "YYYY-MM"
    start: string;
    end: string;
    onChange: (range: { start: string; end: string }) => void;
}) {
    const [year, setYear] = useState(Number(start.slice(0, 4)));
    // After the first click, the next click picks the last month.
    const [pickingEnd, setPickingEnd] = useState(false);
    const [hovered, setHovered] = useState<number | null>(null);

    const from = toIndex(start);
    const to = toIndex(end);
    // While choosing the last month, show the range up to where the pointer is.
    const shownTo = pickingEnd && hovered !== null && hovered >= from ? Math.min(hovered, from + MAX_MONTHS - 1) : to;

    const pick = (index: number) => {
        if (!pickingEnd) {
            onChange({ start: toKey(index), end: toKey(index) });
            setPickingEnd(true);
            return;
        }

        // A month before the first one starts the range again from there.
        if (index < from) {
            onChange({ start: toKey(index), end: toKey(index) });
            return;
        }

        onChange({ start: toKey(from), end: toKey(Math.min(index, from + MAX_MONTHS - 1)) });
        setPickingEnd(false);
        setHovered(null);
    };

    return (
        <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-black/20 p-3">
            <div className="mb-2 flex items-center justify-between">
                <button
                    type="button"
                    onClick={() => setYear((y) => y - 1)}
                    aria-label="Previous year"
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-white/70 transition hover:bg-white/10 hover:text-white"
                >
                    <ChevronLeft className="h-4 w-4" />
                </button>
                <p className="text-sm font-bold">{year}</p>
                <button
                    type="button"
                    onClick={() => setYear((y) => y + 1)}
                    aria-label="Next year"
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-white/70 transition hover:bg-white/10 hover:text-white"
                >
                    <ChevronRight className="h-4 w-4" />
                </button>
            </div>

            <div className="grid grid-cols-4 gap-1.5" role="group" aria-label={`Months in ${year}`} onMouseLeave={() => setHovered(null)}>
                {MONTHS.map((name, i) => {
                    const index = year * 12 + i;
                    const isEdge = index === from || index === shownTo;
                    const inRange = index > from && index < shownTo;

                    return (
                        <button
                            key={name}
                            type="button"
                            onClick={() => pick(index)}
                            onMouseEnter={() => setHovered(index)}
                            aria-pressed={isEdge || inRange}
                            className={`h-10 rounded-lg text-sm font-semibold transition ${
                                isEdge
                                    ? "bg-amber-400 text-black"
                                    : inRange
                                        ? "bg-amber-400/20 text-amber-200"
                                        : "text-white/70 hover:bg-white/10 hover:text-white"
                            }`}
                        >
                            {name}
                        </button>
                    );
                })}
            </div>

            <p className="mt-2 text-xs text-white/45">
                {pickingEnd ? "Now click the last month (or the same month again for just one)." : "Click the first month, then the last."}
            </p>
        </div>
    );
}

// The number of months from start to end, inclusive.
export const monthSpan = (start: string, end: string) => Math.max(1, toIndex(end) - toIndex(start) + 1);
