"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
    Building2,
    CheckCircle2,
    ChevronRight,
    Circle,
    ClipboardList,
    Home,
    MapPin,
    Phone,
    User,
    Warehouse,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/utils/supabase/client";
import { notifyAdminsOfNewApplication } from "@/lib/signup-notify";

type PropertyType = "residential" | "commercial";

type FormState = {
    date: string;
    landlordName: string;
    propertyAddress: string;
    contactPhone: string;
    whatsappNumber: string;
    email: string;
    lga: string;
    state: string;
    landmark: string;
    propertyType: PropertyType;
    duplexCount: string;
    flatsCount: string;
    miniFlatsCount: string;
    bungalowCount: string;
    terraceCount: string;
    shopsCount: string;
    domesticOthers: string;
    supermarketsCount: string;
    complexesCount: string;
    beachesCount: string;
    marketsCount: string;
    hotelsCount: string;
    schoolsCount: string;
    carWashBarsCount: string;
    blockIndustryCount: string;
    eateryCount: string;
    workshopCount: string;
    commercialOthers: string;
    preferredPickupFrequency: string;
    customFrequency: string;
    wasteType: string;
    specialNotes: string;
    agreed: boolean;
};

const initialState: FormState = {
    date: new Date().toISOString().split("T")[0],
    landlordName: "",
    propertyAddress: "",
    contactPhone: "",
    whatsappNumber: "",
    email: "",
    lga: "",
    state: "",
    landmark: "",
    propertyType: "residential",
    duplexCount: "",
    flatsCount: "",
    miniFlatsCount: "",
    bungalowCount: "",
    terraceCount: "",
    shopsCount: "",
    domesticOthers: "",
    supermarketsCount: "",
    complexesCount: "",
    beachesCount: "",
    marketsCount: "",
    hotelsCount: "",
    schoolsCount: "",
    carWashBarsCount: "",
    blockIndustryCount: "",
    eateryCount: "",
    workshopCount: "",
    commercialOthers: "",
    preferredPickupFrequency: "Weekly",
    customFrequency: "",
    wasteType: "General Waste",
    specialNotes: "",
    agreed: false,
};

function FieldLabel({
                        children,
                        required = false,
                    }: {
    children: React.ReactNode;
    required?: boolean;
}) {
    return (
        <label className="mb-2 block text-sm font-semibold text-white/80">
            {children}
            {required && <span className="ml-1 text-amber-300">*</span>}
        </label>
    );
}

function TextInput({
                       value,
                       onChange,
                       placeholder,
                       type = "text",
                   }: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    type?: string;
}) {
    return (
        <input
            type={type}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="h-12 w-full rounded-2xl border border-white/10 bg-white/8 px-4 text-white outline-none transition placeholder:text-white/30 focus:border-amber-300/50 focus:bg-white/10"
        />
    );
}

function SelectInput({
                         value,
                         onChange,
                         options,
                     }: {
    value: string;
    onChange: (value: string) => void;
    options: string[];
}) {
    return (
        <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="h-12 w-full rounded-2xl border border-white/10 bg-[#141518] px-4 text-white outline-none transition focus:border-amber-300/50"
        >
            {options.map((option) => (
                <option key={option} value={option} className="bg-[#141518] text-white">
                    {option}
                </option>
            ))}
        </select>
    );
}

function SectionCard({
                         icon: Icon,
                         title,
                         subtitle,
                         children,
                     }: {
    icon: React.ComponentType<{ className?: string }>;
    title: string;
    subtitle: string;
    children: React.ReactNode;
}) {
    return (
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 md:p-6">
            <div className="mb-6 flex items-start gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-400/15 ring-1 ring-amber-300/20">
                    <Icon className="h-5 w-5 text-amber-300" />
                </div>
                <div>
                    <h2 className="text-xl font-bold text-white">{title}</h2>
                    <p className="mt-1 text-sm text-white/55">{subtitle}</p>
                </div>
            </div>
            {children}
        </section>
    );
}

export default function CustomerSetupPage() {
    const router = useRouter();
    const [form, setForm] = useState<FormState>(initialState);
    const [submitting, setSubmitting] = useState(false);

    const progress = useMemo(() => {
        const requiredFields = [
            form.landlordName,
            form.propertyAddress,
            form.contactPhone,
            form.whatsappNumber,
            form.lga,
            form.state,
            form.preferredPickupFrequency,
            form.wasteType,
            form.agreed ? "yes" : "",
        ];
        const completed = requiredFields.filter(Boolean).length;
        return Math.round((completed / requiredFields.length) * 100);
    }, [form]);

    const checklist = useMemo(() => {
        const anyFacility = [
            form.duplexCount,
            form.flatsCount,
            form.miniFlatsCount,
            form.bungalowCount,
            form.terraceCount,
            form.shopsCount,
            form.domesticOthers,
            form.supermarketsCount,
            form.complexesCount,
            form.beachesCount,
            form.marketsCount,
            form.hotelsCount,
            form.schoolsCount,
            form.carWashBarsCount,
            form.blockIndustryCount,
            form.eateryCount,
            form.workshopCount,
            form.commercialOthers,
        ].some((value) => value.trim() !== "");

        return [
            {
                label: "Account holder details",
                done: Boolean(form.landlordName.trim() && form.contactPhone.trim() && form.whatsappNumber.trim()),
            },
            {
                label: "Property address and area",
                done: Boolean(form.propertyAddress.trim() && form.lga.trim() && form.state.trim()),
            },
            { label: "Facility information", done: anyFacility },
            {
                label: "Pickup preferences",
                done: Boolean(
                    form.wasteType &&
                    form.preferredPickupFrequency &&
                    (form.preferredPickupFrequency !== "Custom" || form.customFrequency.trim())
                ),
            },
        ];
    }, [form]);

    function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
        setForm((prev) => ({ ...prev, [key]: value }));
    }

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();

        if (
            !form.landlordName ||
            !form.propertyAddress ||
            !form.contactPhone ||
            !form.whatsappNumber ||
            !form.lga ||
            !form.state ||
            !form.agreed
        ) {
            alert("Please complete all required fields before continuing.");
            return;
        }

        if (form.preferredPickupFrequency === "Custom" && !form.customFrequency.trim()) {
            alert("Please describe how often you want pickups, for example: daily, or 3 times a week.");
            return;
        }

        try {
            setSubmitting(true);

            const supabase = createClient();

            const {
                data: { user },
            } = await supabase.auth.getUser();

            if (!user) {
                toast.error("Your session expired. Please log in again.");
                router.push("/auth");
                return;
            }

            const { error } = await supabase.from("customers").insert({
                profile_id: user.id,
                full_name: form.landlordName,
                email: form.email || user.email,
                phone: form.contactPhone,
                whatsapp_number: form.whatsappNumber,
                address: form.propertyAddress,
                lga: form.lga,
                state: form.state,
                landmark: form.landmark,
                property_type: form.propertyType,
                preferred_pickup_frequency:
                    form.preferredPickupFrequency === "Custom"
                        ? form.customFrequency.trim()
                        : form.preferredPickupFrequency,
                waste_type: form.wasteType,
                special_notes: form.specialNotes,
                facility_details: {
                    duplexCount: form.duplexCount,
                    flatsCount: form.flatsCount,
                    miniFlatsCount: form.miniFlatsCount,
                    bungalowCount: form.bungalowCount,
                    terraceCount: form.terraceCount,
                    shopsCount: form.shopsCount,
                    domesticOthers: form.domesticOthers,
                    supermarketsCount: form.supermarketsCount,
                    complexesCount: form.complexesCount,
                    beachesCount: form.beachesCount,
                    marketsCount: form.marketsCount,
                    hotelsCount: form.hotelsCount,
                    schoolsCount: form.schoolsCount,
                    carWashBarsCount: form.carWashBarsCount,
                    blockIndustryCount: form.blockIndustryCount,
                    eateryCount: form.eateryCount,
                    workshopCount: form.workshopCount,
                    commercialOthers: form.commercialOthers,
                },
            });

            // A unique profile_id means this customer already has a row:
            // treat a resubmit as success rather than showing an error.
            if (error && error.code !== "23505") {
                toast.error(error.message || "Unable to save your details. Please try again.");
                return;
            }

            // Only for a newly created row, so a resubmit can't email twice.
            if (!error) {
                await notifyAdminsOfNewApplication().catch(() => {});
            }

            window.location.href = "/auth/pending?role=customer";
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="min-h-screen bg-[#0a0a0b] text-white">
            <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 lg:px-8">
                <div className="mb-6 grid gap-5 lg:grid-cols-[1.1fr_0.65fr]">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 md:p-8">
                        <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-amber-300/20 bg-amber-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">
                Jigzack Customer Setup
              </span>
                            <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-white/60">
                Step 1 of 2
              </span>
                        </div>

                        <h1 className="mt-5 text-3xl font-black tracking-tight md:text-5xl">
                            Let’s complete your service profile
                        </h1>

                        <p className="mt-4 max-w-2xl text-sm leading-6 text-white/65 md:text-base">
                            Fill in your residential or commercial property details so your account can be reviewed,
                            scheduled properly, and prepared for pickup service.
                        </p>

                        <ol className="mt-7 flex items-start" aria-label="Setup steps">
                            {["Property details", "Service planning", "Admin review"].map((label, index) => (
                                <li
                                    key={label}
                                    aria-current={index === 0 ? "step" : undefined}
                                    className="relative flex flex-1 flex-col items-center text-center"
                                >
                                    {index > 0 && (
                                        <span
                                            aria-hidden="true"
                                            className="absolute left-[-50%] top-3.5 h-px w-full bg-white/15"
                                        />
                                    )}
                                    <span
                                        className={`relative z-10 flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                                            index === 0
                                                ? "bg-amber-400 text-black"
                                                : "border border-white/20 bg-[#0a0a0b] text-white/50"
                                        }`}
                                    >
                                        {index + 1}
                                    </span>
                                    <span
                                        className={`mt-2 px-1 text-[11px] leading-4 sm:text-xs ${
                                            index === 0 ? "font-semibold text-white" : "text-white/50"
                                        }`}
                                    >
                                        {label}
                                    </span>
                                </li>
                            ))}
                        </ol>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                        <div className="flex items-baseline justify-between gap-4">
                            <p className="text-xs uppercase tracking-[0.2em] text-white/45">Your progress</p>
                            <p className="text-2xl font-black text-amber-300">{progress}%</p>
                        </div>

                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/8">
                            <div
                                className="h-full rounded-full bg-gradient-to-r from-amber-300 to-orange-400 transition-all duration-500"
                                style={{ width: `${progress}%` }}
                            />
                        </div>

                        <p className="mt-2 text-xs leading-5 text-white/45">
                            {progress === 100
                                ? "Everything required is filled in. Submit at the bottom of the form."
                                : "Fill in the form below. Each item ticks off as you complete it."}
                        </p>

                        <ul className="mt-4 space-y-2.5">
                            {checklist.map((item) => (
                                <li key={item.label} className="flex items-center gap-2.5 text-sm">
                                    {item.done ? (
                                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                                    ) : (
                                        <Circle className="h-4 w-4 shrink-0 text-white/25" />
                                    )}
                                    <span className={item.done ? "text-white/85" : "text-white/50"}>{item.label}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <SectionCard
                        icon={User}
                        title="Account Holder Information"
                        subtitle="Basic contact and account details from the customer sign-up form."
                    >
                        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                            <div>
                                <FieldLabel required>Landlord / Landlady Name</FieldLabel>
                                <TextInput
                                    value={form.landlordName}
                                    onChange={(value) => updateField("landlordName", value)}
                                    placeholder="Full name"
                                />
                            </div>

                            <div>
                                <FieldLabel required>Date</FieldLabel>
                                <TextInput
                                    type="date"
                                    value={form.date}
                                    onChange={(value) => updateField("date", value)}
                                />
                            </div>

                            <div>
                                <FieldLabel>Email</FieldLabel>
                                <TextInput
                                    type="email"
                                    value={form.email}
                                    onChange={(value) => updateField("email", value)}
                                    placeholder="name@example.com"
                                />
                            </div>

                            <div>
                                <FieldLabel required>Contact Phone Number</FieldLabel>
                                <TextInput
                                    value={form.contactPhone}
                                    onChange={(value) => updateField("contactPhone", value)}
                                    placeholder="Phone number"
                                />
                            </div>

                            <div>
                                <FieldLabel required>WhatsApp Number</FieldLabel>
                                <TextInput
                                    value={form.whatsappNumber}
                                    onChange={(value) => updateField("whatsappNumber", value)}
                                    placeholder="WhatsApp number"
                                />
                            </div>

                            <div>
                                <FieldLabel>Landmark</FieldLabel>
                                <TextInput
                                    value={form.landmark}
                                    onChange={(value) => updateField("landmark", value)}
                                    placeholder="Nearby landmark"
                                />
                            </div>
                        </div>
                    </SectionCard>

                    <SectionCard
                        icon={MapPin}
                        title="Property Location"
                        subtitle="Used for route planning, pickup scheduling, and admin review."
                    >
                        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                            <div className="md:col-span-2 xl:col-span-2">
                                <FieldLabel required>Property Address</FieldLabel>
                                <TextInput
                                    value={form.propertyAddress}
                                    onChange={(value) => updateField("propertyAddress", value)}
                                    placeholder="Street address and area"
                                />
                            </div>

                            <div>
                                <FieldLabel required>L.G.A</FieldLabel>
                                <TextInput
                                    value={form.lga}
                                    onChange={(value) => updateField("lga", value)}
                                    placeholder="Local government area"
                                />
                            </div>

                            <div>
                                <FieldLabel required>State</FieldLabel>
                                <TextInput
                                    value={form.state}
                                    onChange={(value) => updateField("state", value)}
                                    placeholder="State"
                                />
                            </div>

                            <div>
                                <FieldLabel required>Property Type</FieldLabel>
                                <SelectInput
                                    value={form.propertyType}
                                    onChange={(value) => updateField("propertyType", value as PropertyType)}
                                    options={["residential", "commercial"]}
                                />
                            </div>

                            <div>
                                <FieldLabel>Preferred Pickup Frequency</FieldLabel>
                                <SelectInput
                                    value={form.preferredPickupFrequency}
                                    onChange={(value) => updateField("preferredPickupFrequency", value)}
                                    options={["Weekly", "Bi-weekly", "Monthly", "Custom"]}
                                />
                            </div>

                            {form.preferredPickupFrequency === "Custom" && (
                                <div className="md:col-span-2 xl:col-span-2">
                                    <FieldLabel required>Describe your pickup frequency</FieldLabel>
                                    <TextInput
                                        value={form.customFrequency}
                                        onChange={(value) => updateField("customFrequency", value)}
                                        placeholder="e.g. Daily, or 3 times a week"
                                    />
                                    <p className="mt-2 text-xs text-white/40">
                                        Type it in your own words. Your schedule is built from this.
                                    </p>
                                </div>
                            )}

                            <div>
                                <FieldLabel>Waste Type</FieldLabel>
                                <SelectInput
                                    value={form.wasteType}
                                    onChange={(value) => updateField("wasteType", value)}
                                    options={[
                                        "General Waste",
                                        "Mixed Waste",
                                        "Commercial Waste",
                                        "Recyclables",
                                        "Residential Waste",
                                    ]}
                                />
                            </div>
                        </div>
                    </SectionCard>

                    <SectionCard
                        icon={Home}
                        title="Domestic Facilities / Property Details"
                        subtitle="Fill this for residential properties, based on the paper form you shared."
                    >
                        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-6">
                            <div>
                                <FieldLabel>Duplex</FieldLabel>
                                <TextInput
                                    value={form.duplexCount}
                                    onChange={(value) => updateField("duplexCount", value)}
                                    placeholder="0"
                                />
                            </div>

                            <div>
                                <FieldLabel>Flats</FieldLabel>
                                <TextInput
                                    value={form.flatsCount}
                                    onChange={(value) => updateField("flatsCount", value)}
                                    placeholder="0"
                                />
                            </div>

                            <div>
                                <FieldLabel>Mini Flats</FieldLabel>
                                <TextInput
                                    value={form.miniFlatsCount}
                                    onChange={(value) => updateField("miniFlatsCount", value)}
                                    placeholder="0"
                                />
                            </div>

                            <div>
                                <FieldLabel>Bungalows</FieldLabel>
                                <TextInput
                                    value={form.bungalowCount}
                                    onChange={(value) => updateField("bungalowCount", value)}
                                    placeholder="0"
                                />
                            </div>

                            <div>
                                <FieldLabel>Terraces</FieldLabel>
                                <TextInput
                                    value={form.terraceCount}
                                    onChange={(value) => updateField("terraceCount", value)}
                                    placeholder="0"
                                />
                            </div>

                            <div>
                                <FieldLabel>Shops</FieldLabel>
                                <TextInput
                                    value={form.shopsCount}
                                    onChange={(value) => updateField("shopsCount", value)}
                                    placeholder="0"
                                />
                            </div>

                            <div className="xl:col-span-6">
                                <FieldLabel>Others</FieldLabel>
                                <TextInput
                                    value={form.domesticOthers}
                                    onChange={(value) => updateField("domesticOthers", value)}
                                    placeholder="Any other property type"
                                />
                            </div>
                        </div>
                    </SectionCard>

                    <SectionCard
                        icon={Warehouse}
                        title="Commercial Facilities"
                        subtitle="Fill this for business or mixed-use properties where applicable."
                    >
                        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-5">
                            <div>
                                <FieldLabel>Supermarkets</FieldLabel>
                                <TextInput
                                    value={form.supermarketsCount}
                                    onChange={(value) => updateField("supermarketsCount", value)}
                                    placeholder="0"
                                />
                            </div>

                            <div>
                                <FieldLabel>Complexes</FieldLabel>
                                <TextInput
                                    value={form.complexesCount}
                                    onChange={(value) => updateField("complexesCount", value)}
                                    placeholder="0"
                                />
                            </div>

                            <div>
                                <FieldLabel>Beaches</FieldLabel>
                                <TextInput
                                    value={form.beachesCount}
                                    onChange={(value) => updateField("beachesCount", value)}
                                    placeholder="0"
                                />
                            </div>

                            <div>
                                <FieldLabel>Markets</FieldLabel>
                                <TextInput
                                    value={form.marketsCount}
                                    onChange={(value) => updateField("marketsCount", value)}
                                    placeholder="0"
                                />
                            </div>

                            <div>
                                <FieldLabel>Hotels</FieldLabel>
                                <TextInput
                                    value={form.hotelsCount}
                                    onChange={(value) => updateField("hotelsCount", value)}
                                    placeholder="0"
                                />
                            </div>

                            <div>
                                <FieldLabel>Schools</FieldLabel>
                                <TextInput
                                    value={form.schoolsCount}
                                    onChange={(value) => updateField("schoolsCount", value)}
                                    placeholder="0"
                                />
                            </div>

                            <div>
                                <FieldLabel>Car Wash / Bars</FieldLabel>
                                <TextInput
                                    value={form.carWashBarsCount}
                                    onChange={(value) => updateField("carWashBarsCount", value)}
                                    placeholder="0"
                                />
                            </div>

                            <div>
                                <FieldLabel>Block Industry</FieldLabel>
                                <TextInput
                                    value={form.blockIndustryCount}
                                    onChange={(value) => updateField("blockIndustryCount", value)}
                                    placeholder="0"
                                />
                            </div>

                            <div>
                                <FieldLabel>Eatery</FieldLabel>
                                <TextInput
                                    value={form.eateryCount}
                                    onChange={(value) => updateField("eateryCount", value)}
                                    placeholder="0"
                                />
                            </div>

                            <div>
                                <FieldLabel>Workshop</FieldLabel>
                                <TextInput
                                    value={form.workshopCount}
                                    onChange={(value) => updateField("workshopCount", value)}
                                    placeholder="0"
                                />
                            </div>

                            <div className="xl:col-span-5">
                                <FieldLabel>Other Commercial Notes</FieldLabel>
                                <TextInput
                                    value={form.commercialOthers}
                                    onChange={(value) => updateField("commercialOthers", value)}
                                    placeholder="Any additional business or facility details"
                                />
                            </div>
                        </div>
                    </SectionCard>

                    <SectionCard
                        icon={ClipboardList}
                        title="Final Notes"
                        subtitle="Any important waste, access, or scheduling notes for the service team."
                    >
                        <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
                            <div>
                                <FieldLabel>Special Notes</FieldLabel>
                                <textarea
                                    value={form.specialNotes}
                                    onChange={(e) => updateField("specialNotes", e.target.value)}
                                    placeholder="Gate access, best pickup time, recurring issues, or anything admin should know..."
                                    className="min-h-[140px] w-full rounded-2xl border border-white/10 bg-white/8 px-4 py-3 text-white outline-none transition placeholder:text-white/30 focus:border-amber-300/50 focus:bg-white/10"
                                />
                            </div>

                            <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
                                <p className="text-xs uppercase tracking-[0.2em] text-white/45">Confirmation</p>
                                <h3 className="mt-3 text-lg font-bold text-white">Ready for review</h3>
                                <p className="mt-2 text-sm leading-6 text-white/60">
                                    Once submitted, your profile moves to admin review and you’ll be redirected to the pending page.
                                </p>

                                <label className="mt-5 flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                                    <input
                                        type="checkbox"
                                        checked={form.agreed}
                                        onChange={(e) => updateField("agreed", e.target.checked)}
                                        className="mt-1 h-4 w-4 rounded border-white/20 bg-transparent text-amber-300"
                                    />
                                    <span className="text-sm leading-6 text-white/75">
                    I confirm that the details provided are correct and can be used for service setup and account review.
                  </span>
                                </label>

                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-400 px-5 py-3 font-bold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-70"
                                >
                                    {submitting ? "Submitting..." : "Submit Details"}
                                    <ChevronRight className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                    </SectionCard>
                </form>
            </div>
        </div>
    );
}