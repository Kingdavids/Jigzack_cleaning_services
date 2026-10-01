'use client';

import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createNonCustomerInvoice, type NewInvoiceState } from "@/app/admin/actions";
import { itemsTotal, lineTotal, type LineItem } from "@/lib/billing/pricing";

const inputClass =
    "h-11 w-full rounded-xl border border-white/10 bg-white/8 px-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-amber-300/50";

const labelClass = "mb-1 block text-[11px] uppercase tracking-[0.12em] text-white/40";

function SubmitButton() {
    const { pending } = useFormStatus();

    return (
        <button
            type="submit"
            disabled={pending}
            className="w-full rounded-2xl bg-amber-400 px-4 py-3 font-bold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
            {pending ? "Creating…" : "Create invoice"}
        </button>
    );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
    return (
        <label className="block">
            <span className={labelClass}>
                {label}
                {required && <span className="ml-1 text-amber-300">*</span>}
            </span>
            {children}
        </label>
    );
}

// Bills someone who is not registered on the app. Everything the invoice
// needs is filled in here; once created it opens, ready to print, download
// or share with them.
export default function NonCustomerInvoiceForm({ defaultMonth }: { defaultMonth: string }) {
    const router = useRouter();
    const [state, formAction] = useActionState<NewInvoiceState, FormData>(createNonCustomerInvoice, null);
    const [items, setItems] = useState<LineItem[]>([{ label: "Waste management service", quantity: 1, unit_price: 0 }]);

    useEffect(() => {
        if (!state) return;

        if (state.success && state.invoiceId) {
            toast.success("Invoice created");
            router.push(`/admin/invoices/${state.invoiceId}`);
        } else if (state.error) {
            toast.error(state.error);
        }
    }, [state, router]);

    const total = useMemo(() => itemsTotal(items), [items]);

    const update = (index: number, patch: Partial<LineItem>) =>
        setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));

    return (
        <form action={formAction} className="space-y-6">
            <input type="hidden" name="lineItems" value={JSON.stringify(items)} />

            <fieldset className="space-y-3">
                <legend className="mb-2 text-sm font-semibold">Who it&apos;s for</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Name or business" required>
                        <input name="fullName" required maxLength={120} className={inputClass} />
                    </Field>
                    <Field label="Phone">
                        <input name="phone" type="tel" inputMode="tel" maxLength={40} className={inputClass} />
                    </Field>
                    <Field label="WhatsApp">
                        <input name="whatsapp" type="tel" inputMode="tel" maxLength={40} className={inputClass} />
                    </Field>
                    <Field label="Email">
                        <input name="email" type="email" maxLength={160} className={inputClass} />
                    </Field>
                </div>
                <p className="text-xs text-white/40">A phone number or an email is needed so they can be reached about it.</p>
            </fieldset>

            <fieldset className="space-y-3">
                <legend className="mb-2 text-sm font-semibold">Where the service is</legend>
                <Field label="Address" required>
                    <input name="address" required maxLength={300} className={inputClass} />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Field label="Landmark">
                        <input name="landmark" maxLength={160} className={inputClass} />
                    </Field>
                    <Field label="L.G.A">
                        <input name="lga" maxLength={80} className={inputClass} />
                    </Field>
                    <Field label="State">
                        <input name="state" maxLength={80} defaultValue="Lagos" className={inputClass} />
                    </Field>
                    <Field label="Property type">
                        <select name="propertyType" defaultValue="residential" className={`${inputClass} bg-[#141518]`}>
                            <option value="residential">Residential</option>
                            <option value="commercial">Commercial</option>
                        </select>
                    </Field>
                </div>
            </fieldset>

            <fieldset className="space-y-3">
                <legend className="mb-2 text-sm font-semibold">What it&apos;s for</legend>
                <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
                    <Field label="Invoice month">
                        <input name="invoiceMonth" defaultValue={defaultMonth} maxLength={40} className={inputClass} />
                    </Field>
                    <Field label="Description">
                        <input name="description" placeholder={`Waste management service, ${defaultMonth}`} maxLength={200} className={inputClass} />
                    </Field>
                </div>

                <div className="space-y-2">
                    <div className="hidden grid-cols-[1fr_80px_130px_1fr_44px] gap-2 text-[11px] uppercase tracking-[0.12em] text-white/40 sm:grid">
                        <span>Item</span>
                        <span>Qty</span>
                        <span>Unit price (₦)</span>
                        <span>Note</span>
                        <span />
                    </div>

                    {items.map((item, index) => (
                        <div key={index} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_80px_130px_1fr_44px]">
                            <input
                                value={item.label}
                                onChange={(e) => update(index, { label: e.target.value })}
                                placeholder="Item, e.g. Flat"
                                aria-label="Item"
                                className={`${inputClass} col-span-2 sm:col-span-1`}
                            />
                            <input
                                type="number"
                                min="0"
                                value={item.quantity}
                                onChange={(e) => update(index, { quantity: Number(e.target.value) })}
                                aria-label="Quantity"
                                className={inputClass}
                            />
                            <input
                                type="number"
                                value={item.unit_price}
                                onChange={(e) => update(index, { unit_price: Number(e.target.value) })}
                                aria-label="Unit price (negative for a discount line)"
                                className={inputClass}
                            />
                            <input
                                value={item.note ?? ""}
                                onChange={(e) => update(index, { note: e.target.value })}
                                placeholder="Note (optional)"
                                aria-label="Note"
                                className={`${inputClass} col-span-2 sm:col-span-1`}
                            />
                            <button
                                type="button"
                                onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
                                disabled={items.length === 1}
                                aria-label="Remove line"
                                className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 text-white/50 transition hover:text-red-300 disabled:opacity-30"
                            >
                                <Trash2 className="h-4 w-4" />
                            </button>
                        </div>
                    ))}

                    <button
                        type="button"
                        onClick={() => setItems((prev) => [...prev, { label: "", quantity: 1, unit_price: 0 }])}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/10"
                    >
                        <Plus className="h-3.5 w-3.5" />
                        Add line
                    </button>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div className="sm:w-48">
                        <Field label="Arrears (₦)">
                            <input name="arrears" type="number" min="0" step="0.01" placeholder="0" className={inputClass} />
                        </Field>
                    </div>
                    <p className="text-right text-sm text-white/60">
                        Charges: <strong className="text-lg text-white">₦{total.toLocaleString()}</strong>
                        <span className="ml-2 text-xs text-white/35">({items.filter((i) => lineTotal(i) !== 0).length} priced lines)</span>
                    </p>
                </div>
            </fieldset>

            <SubmitButton />
        </form>
    );
}
