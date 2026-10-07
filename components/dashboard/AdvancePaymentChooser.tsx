'use client';

import { useState } from "react";
import PrepaymentForm from "@/components/dashboard/PrepaymentForm";

const fieldClass =
    "mt-1 h-11 w-full rounded-lg border border-white/10 bg-white/8 px-3 text-base text-white outline-none placeholder:text-white/30 focus:border-amber-300/50 sm:h-10 sm:text-sm";

// Records an advance payment from the Payments page, for a registered customer
// or for someone who is not registered (their details are kept on the payment
// and it moves to their account when they register).
export default function AdvancePaymentChooser({ customers }: { customers: { id: string; full_name: string | null }[] }) {
    const [who, setWho] = useState<"registered" | "unregistered">("registered");
    const [customerId, setCustomerId] = useState("");
    const [name, setName] = useState("");
    const [property, setProperty] = useState("");
    const [phone, setPhone] = useState("");
    const [email, setEmail] = useState("");
    const [address, setAddress] = useState("");

    const chosen = customers.find((c) => c.id === customerId);

    return (
        <div className="space-y-4">
            <div role="group" aria-label="Who paid" className="grid grid-cols-2 gap-2 sm:max-w-md">
                {([
                    { value: "registered", label: "A customer", hint: "Registered on the app" },
                    { value: "unregistered", label: "Not registered", hint: "No account yet" },
                ] as const).map((option) => (
                    <button
                        key={option.value}
                        type="button"
                        onClick={() => setWho(option.value)}
                        aria-pressed={who === option.value}
                        className={`rounded-xl border px-4 py-3 text-left transition ${
                            who === option.value ? "border-amber-400 bg-amber-400/15" : "border-white/10 bg-white/5 hover:bg-white/10"
                        }`}
                    >
                        <p className="font-bold">{option.label}</p>
                        <p className="text-xs text-white/50">{option.hint}</p>
                    </button>
                ))}
            </div>

            {who === "registered" ? (
                <>
                    <label className="block text-xs text-white/50 sm:max-w-md">
                        Customer
                        <select
                            value={customerId}
                            onChange={(e) => setCustomerId(e.target.value)}
                            className="mt-1 h-11 w-full rounded-lg border border-white/10 bg-[#141518] px-2 text-base text-white outline-none sm:h-10 sm:text-sm"
                        >
                            <option value="">Choose the customer who paid</option>
                            {customers.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.full_name}
                                </option>
                            ))}
                        </select>
                    </label>
                    {customerId ? (
                        <PrepaymentForm key={customerId} profileId={customerId} customName={chosen?.full_name ?? "this customer"} monthlyCharge={0} canRecord payments={[]} />
                    ) : (
                        <p className="text-sm text-white/50">Choose a customer to record what they paid ahead.</p>
                    )}
                </>
            ) : (
                <>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="text-xs text-white/50">
                            Name of the person who paid
                            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className={fieldClass} />
                        </label>
                        <label className="text-xs text-white/50">
                            Property name (optional)
                            <input value={property} onChange={(e) => setProperty(e.target.value)} maxLength={120} placeholder="e.g. Grace Hotel" className={fieldClass} />
                        </label>
                        <label className="text-xs text-white/50">
                            Phone (optional)
                            <input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} inputMode="tel" className={fieldClass} />
                        </label>
                        <label className="text-xs text-white/50">
                            Email (optional)
                            <input value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} inputMode="email" className={fieldClass} />
                        </label>
                        <label className="text-xs text-white/50 sm:col-span-2">
                            Address (optional)
                            <input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={200} className={fieldClass} />
                        </label>
                    </div>
                    <p className="text-xs text-white/45">
                        Add their email if you can: when they sign up with it, their advance payments move to their account on their own.
                    </p>
                    <PrepaymentForm
                        person={{ full_name: name, property_name: property || null, phone: phone || null, whatsapp_number: null, email: email || null, address: address || null }}
                        customName={name.trim() || "this person"}
                        monthlyCharge={0}
                        canRecord
                        payments={[]}
                    />
                </>
            )}
        </div>
    );
}
