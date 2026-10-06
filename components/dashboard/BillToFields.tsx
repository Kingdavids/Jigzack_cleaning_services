'use client';

import type { BillTo } from "@/lib/billing/billTo";
import type { InvoiceKind } from "@/components/dashboard/InvoiceBuilder";

const inputClass =
    "h-11 w-full rounded-xl border border-white/10 bg-white/8 px-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-amber-300/50";

const labelClass = "mb-1 block text-[11px] uppercase tracking-[0.12em] text-white/40";

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

// Who an invoice is for and where the service is, for someone not registered
// on the app. Used when creating their invoice and when correcting it later.
export default function BillToFields({ defaults, kind = "service" }: { defaults?: Partial<BillTo> | null; kind?: InvoiceKind }) {
    // A buyer or a one-off client needs contact details, but not a property.
    const property = kind === "service";

    return (
        <>
            <fieldset className="space-y-3">
                <legend className="mb-2 text-sm font-semibold">Who it&apos;s for</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Name of the person or business" required>
                        <input name="fullName" required maxLength={120} defaultValue={defaults?.full_name ?? ""} className={inputClass} />
                    </Field>
                    <Field label={property ? "Property name (optional)" : "Company or business name (optional)"}>
                        <input
                            name="propertyName"
                            maxLength={120}
                            defaultValue={defaults?.property_name ?? ""}
                            placeholder="e.g. Grace Hotel"
                            className={inputClass}
                        />
                    </Field>
                    <Field label="Phone">
                        <input name="phone" type="tel" inputMode="tel" maxLength={40} defaultValue={defaults?.phone ?? ""} className={inputClass} />
                    </Field>
                    <Field label="WhatsApp">
                        <input
                            name="whatsapp"
                            type="tel"
                            inputMode="tel"
                            maxLength={40}
                            defaultValue={defaults?.whatsapp_number ?? ""}
                            className={inputClass}
                        />
                    </Field>
                    <Field label="Email">
                        <input name="email" type="email" maxLength={160} defaultValue={defaults?.email ?? ""} className={inputClass} />
                    </Field>
                </div>
                <p className="text-xs text-white/40">
                    A phone number or an email is needed so they can be reached. If a property name is given, the invoice shows that
                    name alone as the account holder.
                </p>
            </fieldset>

            <fieldset className="space-y-3">
                <legend className="mb-2 text-sm font-semibold">{property ? "Where the service is" : "Address (optional)"}</legend>
                <Field label="Address" required={property}>
                    <input name="address" required={property} maxLength={300} defaultValue={defaults?.address ?? ""} className={inputClass} />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Field label="Landmark">
                        <input name="landmark" maxLength={160} defaultValue={defaults?.landmark ?? ""} className={inputClass} />
                    </Field>
                    <Field label="L.G.A">
                        <input name="lga" maxLength={80} defaultValue={defaults?.lga ?? ""} className={inputClass} />
                    </Field>
                    <Field label="State">
                        <input name="state" maxLength={80} defaultValue={defaults?.state ?? "Lagos"} className={inputClass} />
                    </Field>
                    {property && (
                        <Field label="Property type">
                            <select name="propertyType" defaultValue={defaults?.property_type ?? "residential"} className={`${inputClass} bg-[#141518]`}>
                                <option value="residential">Residential</option>
                                <option value="commercial">Commercial</option>
                            </select>
                        </Field>
                    )}
                </div>
            </fieldset>
        </>
    );
}
