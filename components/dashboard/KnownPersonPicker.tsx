'use client';

import { useId, useState } from "react";
import type { BillTo } from "@/lib/billing/billTo";

const inputClass =
    "h-11 w-full rounded-xl border border-white/10 bg-white/8 px-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-amber-300/50";

// Someone invoiced before without an account, as one line to pick from and the
// details to start a new invoice or payment with.
export type KnownPerson = { label: string; billTo: BillTo };

// A search box over people already known as "not registered". Picking one hands
// their saved details to the form around it, which stays editable.
export default function KnownPersonPicker({
    people,
    onPick,
    title = "Invoiced before? Pick them to fill in their details",
}: {
    people: KnownPerson[];
    onPick: (person: KnownPerson | null) => void;
    title?: string;
}) {
    const listId = useId();
    const [search, setSearch] = useState("");
    const [chosen, setChosen] = useState<KnownPerson | null>(null);

    if (people.length === 0) return null;

    return (
        <div className="rounded-xl border border-amber-300/25 bg-amber-300/[0.05] p-4">
            <label className="block">
                <span className="mb-1 block text-[11px] uppercase tracking-[0.12em] text-white/40">{title}</span>
                <input
                    list={listId}
                    value={search}
                    onChange={(e) => {
                        const match = people.find((person) => person.label === e.target.value) ?? null;
                        setSearch(e.target.value);
                        setChosen(match);
                        onPick(match);
                    }}
                    placeholder="Start typing a name, phone number or address"
                    autoComplete="off"
                    className={inputClass}
                />
            </label>
            <datalist id={listId}>
                {people.map((person) => (
                    <option key={person.label} value={person.label} />
                ))}
            </datalist>
            <p className="mt-2 text-xs text-white/50">
                {chosen
                    ? "Their details are filled in below. You can change any of them."
                    : "People you have invoiced or listed as not registered. Or leave this empty and type in a new person's details."}
            </p>
        </div>
    );
}
