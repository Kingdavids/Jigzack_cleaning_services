'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateLinkedPropertyDetails } from "@/lib/property-actions";
import { COMMERCIAL_FACILITIES, DOMESTIC_FACILITIES, facilityCount, type FacilityDetails } from "@/lib/customer/facilities";

const inputClass =
    "h-11 w-full rounded-xl border border-white/10 bg-white/8 px-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-amber-300/50";

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
    return (
        <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-white/45">
                {label}
                {required && <span className="text-amber-300"> *</span>}
            </span>
            {children}
        </label>
    );
}

export default function PropertyDetailsForm({
                                                 linkedProfileId,
                                                 defaults,
                                             }: {
    linkedProfileId: string;
    defaults: {
        full_name: string | null;
        address: string | null;
        lga: string | null;
        state: string | null;
        landmark: string | null;
        property_type: string | null;
        preferred_pickup_frequency: string | null;
        facility_details?: FacilityDetails;
    };
}) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const [propertyType, setPropertyType] = useState(defaults.property_type ?? "residential");

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (busy) return;

        setBusy(true);
        const result = await updateLinkedPropertyDetails(linkedProfileId, new FormData(e.currentTarget));
        setBusy(false);

        if (!result.success) {
            toast.error(result.error ?? "Could not save.");
            return;
        }

        toast.success(result.message ?? "Saved");
        router.push("/customer");
        router.refresh();
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Name on the account" required>
                    <input name="fullName" defaultValue={defaults.full_name ?? ""} required className={inputClass} />
                </Field>
                <Field label="Property type">
                    <select
                        name="propertyType"
                        value={propertyType}
                        onChange={(e) => setPropertyType(e.target.value)}
                        className={`${inputClass} bg-[#141518]`}
                    >
                        <option value="residential">Residential</option>
                        <option value="commercial">Commercial</option>
                    </select>
                </Field>
                <Field label="Address" required>
                    <input name="address" defaultValue={defaults.address ?? ""} required className={inputClass} />
                </Field>
                <Field label="Landmark">
                    <input name="landmark" defaultValue={defaults.landmark ?? ""} placeholder="Optional" className={inputClass} />
                </Field>
                <Field label="Area (LGA)" required>
                    <input name="lga" defaultValue={defaults.lga ?? ""} required className={inputClass} />
                </Field>
                <Field label="State" required>
                    <input name="state" defaultValue={defaults.state ?? ""} required className={inputClass} />
                </Field>
                <Field label="Preferred pickup frequency">
                    <input
                        name="pickupFrequency"
                        defaultValue={defaults.preferred_pickup_frequency ?? ""}
                        placeholder="e.g. Weekly, or 3 times a week"
                        className={inputClass}
                    />
                </Field>
            </div>

            {propertyType === "commercial" && (
                <div className="rounded-2xl border border-amber-300/30 bg-amber-300/[0.07] p-4 text-sm leading-relaxed text-white/85">
                    <p className="font-semibold text-amber-200">Commercial facilities are inspected first</p>
                    <p className="mt-1">
                        We visit and survey the site before we give a quote, because the right price depends on the amount and type of waste.
                        Once saved, our team will contact you to arrange the visit.
                    </p>
                </div>
            )}

            <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-white/45">
                    Units on this property (drives its monthly invoice)
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {DOMESTIC_FACILITIES.map((facility) => (
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
                    <Field label="Other domestic">
                        <input
                            name="domesticOthers"
                            defaultValue={String(defaults.facility_details?.domesticOthers ?? "")}
                            placeholder="Any other property type"
                            className={inputClass}
                        />
                    </Field>
                </div>
            </div>

            <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-white/45">
                    Commercial facilities (for business or mixed-use properties, where applicable)
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {COMMERCIAL_FACILITIES.map((facility) => (
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
                <Field label="Other commercial notes">
                    <input
                        name="commercialOthers"
                        defaultValue={String(defaults.facility_details?.commercialOthers ?? "")}
                        placeholder="Any additional business or facility details"
                        className={inputClass}
                    />
                </Field>
                <p className="mt-2 text-xs text-white/40">
                    A commercial property is priced after we visit and survey the site, the same as any commercial signup.
                </p>
            </div>

            <button
                type="submit"
                disabled={busy}
                className="h-12 w-full rounded-xl bg-amber-400 font-bold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:px-6"
            >
                {busy ? "Saving..." : "Save property"}
            </button>
        </form>
    );
}
