'use client';

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import type { CustomerActionState } from "@/app/admin/actions";
import { DOMESTIC_FACILITIES, facilityCount, type FacilityDetails } from "@/lib/customer/facilities";
import { UNIT_PRICES } from "@/lib/billing/pricing";

function SubmitButton() {
    const { pending } = useFormStatus();
    return (
        <button
            type="submit"
            disabled={pending}
            className="rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-bold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
            {pending ? "Saving…" : "Save vacancies"}
        </button>
    );
}

export default function VacancyForm({
                                         action,
                                         profileId,
                                         facilityDetails,
                                         vacancies,
                                         note,
                                     }: {
    action: (prev: CustomerActionState, formData: FormData) => Promise<CustomerActionState>;
    profileId: string;
    facilityDetails: FacilityDetails;
    vacancies: FacilityDetails;
    note: string | null;
}) {
    const [state, formAction] = useActionState<CustomerActionState, FormData>(action, null);

    useEffect(() => {
        if (!state) return;
        if (state.success) toast.success(state.message ?? "Saved", { duration: 7000 });
        else if (state.error) toast.error(state.error);
    }, [state]);

    // Only priced types matter for billing, and only ones this customer has.
    const rows = DOMESTIC_FACILITIES.filter(
        (f) => UNIT_PRICES[f.key] !== undefined && facilityCount(facilityDetails, f.key) > 0
    );

    if (rows.length === 0) {
        return (
            <p className="text-sm text-white/45">
                This customer has no priced units recorded (flats, mini flats, shops, duplexes, bungalows or
                terraces), so there&apos;s nothing to mark vacant.
            </p>
        );
    }

    return (
        <form action={formAction} className="space-y-4">
            <input type="hidden" name="profileId" value={profileId} />

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {rows.map((facility) => {
                    const registered = facilityCount(facilityDetails, facility.key);
                    return (
                        <label key={facility.key} className="block rounded-xl border border-white/10 bg-black/20 p-3">
                            <span className="text-sm font-semibold">{facility.label}</span>
                            <span className="ml-2 text-xs text-white/40">{registered} registered</span>
                            <div className="mt-2 flex items-center gap-2">
                                <input
                                    name={facility.key}
                                    type="number"
                                    min="0"
                                    max={registered}
                                    defaultValue={facilityCount(vacancies, facility.key) || ""}
                                    placeholder="0"
                                    className="h-10 w-24 rounded-lg border border-white/10 bg-white/8 px-3 text-sm text-white outline-none placeholder:text-white/30"
                                />
                                <span className="text-xs text-white/45">vacant</span>
                            </div>
                        </label>
                    );
                })}
            </div>

            <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-white/45">
                    Note (who told us, when, which unit)
                </span>
                <textarea
                    name="vacancyNote"
                    defaultValue={note ?? ""}
                    placeholder="e.g. Landlord called on the 3rd, Flat 4 is empty until further notice"
                    className="min-h-[80px] w-full rounded-lg border border-white/10 bg-white/8 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-amber-300/50"
                />
            </label>

            <SubmitButton />
        </form>
    );
}
