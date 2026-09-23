'use client';

import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { InvoiceActionState } from "@/app/admin/actions";
import { itemsTotal, lineTotal, type LineItem } from "@/lib/billing/pricing";

function SaveButton() {
    const { pending } = useFormStatus();
    return (
        <button
            type="submit"
            disabled={pending}
            className="rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-bold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
            {pending ? "Saving…" : "Save invoice"}
        </button>
    );
}

const inputClass =
    "h-9 w-full rounded-lg border border-white/10 bg-white/8 px-2.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-amber-300/50";

export default function InvoiceEditor({
                                           action,
                                           invoice,
                                       }: {
    action: (prev: InvoiceActionState, formData: FormData) => Promise<InvoiceActionState>;
    invoice: {
        id: string;
        invoice_month: string | null;
        description: string | null;
        arrears: number;
        amount: number;
        line_items: LineItem[];
        auto_generated: boolean;
    };
}) {
    const [state, formAction] = useActionState<InvoiceActionState, FormData>(action, null);
    const [items, setItems] = useState<LineItem[]>(
        invoice.line_items.length > 0
            ? invoice.line_items
            : [{ label: invoice.description ?? "Waste management service charge", quantity: 1, unit_price: invoice.amount }]
    );

    useEffect(() => {
        if (!state) return;
        if (state.success) toast.success("Invoice saved");
        else if (state.error) toast.error(state.error);
    }, [state]);

    const total = useMemo(() => itemsTotal(items), [items]);

    const update = (index: number, patch: Partial<LineItem>) =>
        setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));

    return (
        <details className="mt-3 border-t border-white/10 pt-3">
            <summary className="cursor-pointer text-xs font-semibold text-amber-300 hover:text-amber-200">
                Edit invoice{invoice.auto_generated ? " (auto-generated)" : ""}
            </summary>

            <form action={formAction} className="mt-4 space-y-4">
                <input type="hidden" name="paymentId" value={invoice.id} />
                <input type="hidden" name="lineItems" value={JSON.stringify(items)} />

                <div className="grid gap-3 sm:grid-cols-3">
                    <label className="block">
                        <span className="mb-1 block text-[11px] uppercase tracking-[0.12em] text-white/40">Invoice month</span>
                        <input name="invoiceMonth" defaultValue={invoice.invoice_month ?? ""} className={inputClass} />
                    </label>
                    <label className="block sm:col-span-2">
                        <span className="mb-1 block text-[11px] uppercase tracking-[0.12em] text-white/40">Description</span>
                        <input name="description" defaultValue={invoice.description ?? ""} className={inputClass} />
                    </label>
                </div>

                <div className="space-y-2">
                    <div className="hidden grid-cols-[1fr_80px_110px_1fr_36px] gap-2 text-[11px] uppercase tracking-[0.12em] text-white/40 sm:grid">
                        <span>Item</span>
                        <span>Qty</span>
                        <span>Unit price</span>
                        <span>Note</span>
                        <span />
                    </div>

                    {items.map((item, index) => (
                        <div key={index} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_80px_110px_1fr_36px]">
                            <input
                                value={item.label}
                                onChange={(e) => update(index, { label: e.target.value })}
                                placeholder="Item"
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
                                min="0"
                                value={item.unit_price}
                                onChange={(e) => update(index, { unit_price: Number(e.target.value) })}
                                aria-label="Unit price"
                                className={inputClass}
                            />
                            <input
                                value={item.note ?? ""}
                                onChange={(e) => update(index, { note: e.target.value })}
                                placeholder="Note (optional)"
                                className={`${inputClass} col-span-2 sm:col-span-1`}
                            />
                            <button
                                type="button"
                                onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
                                aria-label="Remove line"
                                className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-white/50 transition hover:text-red-300"
                            >
                                <Trash2 className="h-4 w-4" />
                            </button>
                        </div>
                    ))}

                    <button
                        type="button"
                        onClick={() => setItems((prev) => [...prev, { label: "", quantity: 1, unit_price: 0 }])}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/10"
                    >
                        <Plus className="h-3.5 w-3.5" />
                        Add line
                    </button>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <label className="block sm:w-48">
                        <span className="mb-1 block text-[11px] uppercase tracking-[0.12em] text-white/40">Arrears (₦)</span>
                        <input name="arrears" type="number" min="0" defaultValue={invoice.arrears || ""} placeholder="0" className={inputClass} />
                    </label>

                    <div className="text-right text-sm">
                        <p className="text-white/50">
                            Charges: <strong className="text-white">₦{total.toLocaleString()}</strong>
                            <span className="ml-2 text-xs text-white/35">
                                ({items.map((i) => lineTotal(i)).filter(Boolean).length} priced lines)
                            </span>
                        </p>
                    </div>
                </div>

                <SaveButton />
            </form>
        </details>
    );
}
