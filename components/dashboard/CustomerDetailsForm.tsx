'use client';

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import type { CustomerActionState } from "@/app/admin/actions";
import { ALL_FACILITIES, facilityCount, type FacilityDetails } from "@/lib/customer/facilities";

function SubmitButton({ children }: { children: React.ReactNode }) {
    const { pending } = useFormStatus();
    return (
        <button
            type="submit"
            disabled={pending}
            className="rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-bold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
            {pending ? "Saving…" : children}
        </button>
    );
}

const inputClass =
    "h-10 w-full rounded-lg border border-white/10 bg-white/8 px-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-amber-300/50";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-white/45">{label}</span>
            {children}
        </label>
    );
}

export default function CustomerDetailsForm({
                                                action,
                                                profileId,
                                                defaults,
                                            }: {
    action: (prev: CustomerActionState, formData: FormData) => Promise<CustomerActionState>;
    profileId: string;
    defaults: {
        full_name?: string | null;
        property_name?: string | null;
        phone?: string | null;
        whatsapp_number?: string | null;
        address?: string | null;
        landmark?: string | null;
        lga?: string | null;
        state?: string | null;
        property_type?: string | null;
        account_code: string | null;
        property_code: string | null;
        property_class: string | null;
        status: string | null;
        preferred_pickup_frequency: string | null;
        facility_details: FacilityDetails;
    };
}) {
    const [state, formAction] = useActionState<CustomerActionState, FormData>(action, null);

    useEffect(() => {
        if (!state) return;
        if (state.success) toast.success(state.message ?? "Saved");
        else if (state.error) toast.error(state.error);
    }, [state]);

    return (
        <form action={formAction} className="space-y-5">
            <input type="hidden" name="profileId" value={profileId} />

            <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-white/45">Account holder and property</p>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Field label="Name">
                        <input name="fullName" required maxLength={120} defaultValue={defaults.full_name ?? ""} className={inputClass} />
                    </Field>
                    <Field label="Property name (optional)">
                        <input
                            name="propertyName"
                            maxLength={120}
                            defaultValue={defaults.property_name ?? ""}
                            placeholder="e.g. Grace Hotel"
                            className={inputClass}
                        />
                    </Field>
                    <Field label="Property type">
                        <select name="propertyType" defaultValue={defaults.property_type ?? "residential"} className={`${inputClass} bg-[#141518]`}>
                            <option value="residential">Residential</option>
                            <option value="commercial">Commercial</option>
                        </select>
                    </Field>
                    <Field label="Phone">
                        <input name="phone" type="tel" inputMode="tel" maxLength={40} defaultValue={defaults.phone ?? ""} className={inputClass} />
                    </Field>
                    <Field label="WhatsApp">
                        <input
                            name="whatsapp"
                            type="tel"
                            inputMode="tel"
                            maxLength={40}
                            defaultValue={defaults.whatsapp_number ?? ""}
                            className={inputClass}
                        />
                    </Field>
                    <Field label="Address">
                        <input name="address" maxLength={300} defaultValue={defaults.address ?? ""} className={inputClass} />
                    </Field>
                    <Field label="Landmark">
                        <input name="landmark" maxLength={160} defaultValue={defaults.landmark ?? ""} className={inputClass} />
                    </Field>
                    <Field label="L.G.A">
                        <input name="lga" maxLength={80} defaultValue={defaults.lga ?? ""} className={inputClass} />
                    </Field>
                    <Field label="State">
                        <input name="state" maxLength={80} defaultValue={defaults.state ?? ""} className={inputClass} />
                    </Field>
                </div>
                <p className="mt-2 text-xs text-white/40">
                    If a property name is given, their invoices and receipts show that name alone as the account holder.
                </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Account code">
                    <input name="accountCode" defaultValue={defaults.account_code ?? ""} className={inputClass} />
                </Field>
                <Field label="Property code">
                    <input name="propertyCode" defaultValue={defaults.property_code ?? ""} className={inputClass} />
                </Field>
                <Field label="Property class">
                    <input
                        name="propertyClass"
                        defaultValue={defaults.property_class ?? ""}
                        placeholder="e.g. Residential"
                        className={inputClass}
                    />
                </Field>
                <Field label="Pickup frequency">
                    <input
                        name="pickupFrequency"
                        defaultValue={defaults.preferred_pickup_frequency ?? ""}
                        placeholder="e.g. Weekly, or 3 times a week"
                        className={inputClass}
                    />
                </Field>
                <Field label="Account status">
                    <select
                        name="status"
                        defaultValue={defaults.status ?? "active"}
                        className={`${inputClass} bg-[#141518]`}
                    >
                        <option value="active">Active</option>
                        <option value="inactive">Suspended</option>
                    </select>
                </Field>
            </div>

            <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-white/45">
                    Units on the property (drives the monthly invoice)
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                    {ALL_FACILITIES.map((facility) => (
                        <Field key={facility.key} label={facility.label}>
                            <input
                                name={facility.key}
                                type="number"
                                min="0"
                                defaultValue={facilityCount(defaults.facility_details, facility.key) || ""}
                                placeholder="0"
                                className={inputClass}
                            />
                        </Field>
                    ))}
                </div>
            </div>

            <SubmitButton>Save details</SubmitButton>
        </form>
    );
}
