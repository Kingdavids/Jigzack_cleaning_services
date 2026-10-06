'use client';

import { useState } from "react";
import type { InvoiceKind } from "@/components/dashboard/InvoiceBuilder";
import OneOffInvoiceForm, { type InvoiceCustomerOption } from "@/components/dashboard/OneOffInvoiceForm";
import NonCustomerInvoiceForm from "@/components/dashboard/NonCustomerInvoiceForm";

const choiceClass = (active: boolean) =>
    `rounded-xl border px-4 py-3 text-left transition ${active ? "border-amber-400 bg-amber-400/15" : "border-white/10 bg-white/5 hover:bg-white/10"}`;

// One place to make a hand-made invoice. First what it is for (the property's
// monthly service, a sale of recyclables, or anything else), then who it is
// for: a registered customer, or someone who isn't one.
export default function OneOffInvoiceChooser({
                                                 customers,
                                                 defaultStartMonth,
                                                 stock,
                                             }: {
    customers: InvoiceCustomerOption[];
    defaultStartMonth: string;
    // Kilograms in stock per material, for the recyclables sale.
    stock: Record<string, number>;
}) {
    const [kind, setKind] = useState<InvoiceKind>("service");
    const [who, setWho] = useState<"registered" | "unregistered">("registered");

    return (
        <div className="space-y-5">
            <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-white/45">What is the invoice for?</p>
                <div role="group" aria-label="What is the invoice for?" className="grid gap-2 sm:grid-cols-3">
                    {([
                        { value: "service", label: "Property service", hint: "Monthly charge for a property, one or several months" },
                        { value: "recyclables", label: "Sale of recyclables", hint: "Plastic, metal and so on, by the kilogram. Takes it out of stock" },
                        { value: "other", label: "Other service or item", hint: "Anything else: a hire, a fee, a one-off job" },
                    ] as const).map((option) => (
                        <button key={option.value} type="button" onClick={() => setKind(option.value)} aria-pressed={kind === option.value} className={choiceClass(kind === option.value)}>
                            <p className="font-bold">{option.label}</p>
                            <p className="text-xs text-white/50">{option.hint}</p>
                        </button>
                    ))}
                </div>
            </div>

            <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-white/45">Who is it for?</p>
                <div role="group" aria-label="Who is the invoice for?" className="grid gap-2 sm:grid-cols-2">
                    {([
                        { value: "registered", label: kind === "recyclables" ? "A registered customer" : "A registered customer", hint: "Pick them from the customer list" },
                        {
                            value: "unregistered",
                            label: kind === "recyclables" ? "A buyer who isn't a customer" : "Someone who is not a customer",
                            hint: "Type in their details; no account needed",
                        },
                    ] as const).map((option) => (
                        <button key={option.value} type="button" onClick={() => setWho(option.value)} aria-pressed={who === option.value} className={choiceClass(who === option.value)}>
                            <p className="font-bold">{option.label}</p>
                            <p className="text-xs text-white/50">{option.hint}</p>
                        </button>
                    ))}
                </div>
            </div>

            {who === "registered" ? (
                <OneOffInvoiceForm customers={customers} defaultStartMonth={defaultStartMonth} kind={kind} stock={stock} />
            ) : (
                <NonCustomerInvoiceForm defaultStartMonth={defaultStartMonth} kind={kind} stock={stock} />
            )}
        </div>
    );
}
