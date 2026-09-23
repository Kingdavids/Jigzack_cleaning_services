"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, MapPin, User } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/utils/supabase/client";
import { notifyAdminsOfNewApplication } from "@/lib/signup-notify";

type FormState = {
    fullName: string;
    phone: string;
    address: string;
    lga: string;
    state: string;
    agreed: boolean;
};

const initialState: FormState = {
    fullName: "",
    phone: "",
    address: "",
    lga: "",
    state: "Lagos",
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

export default function EmployeeSetupPage() {
    const router = useRouter();
    const [form, setForm] = useState<FormState>(initialState);
    const [submitting, setSubmitting] = useState(false);

    function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
        setForm((prev) => ({ ...prev, [key]: value }));
    }

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();

        if (!form.fullName || !form.phone || !form.address || !form.lga || !form.state || !form.agreed) {
            toast.error("Please complete all required fields before continuing.");
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

            const { error } = await supabase.from("employees").insert({
                profile_id: user.id,
                full_name: form.fullName,
                phone: form.phone,
                address: form.address,
                lga: form.lga,
                state: form.state,
            });

            // A unique profile_id means this employee already has a row:
            // treat a resubmit as success rather than showing an error.
            if (error && error.code !== "23505") {
                toast.error(error.message || "Unable to save your details. Please try again.");
                return;
            }

            if (!error) {
                await notifyAdminsOfNewApplication().catch(() => {});
            }

            window.location.href = "/auth/pending?role=employee";
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="min-h-screen bg-[#0a0a0b] text-white">
            <div className="mx-auto max-w-3xl px-4 py-10 md:px-6 lg:px-8">
                <div className="mb-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6 md:p-8">
                    <span className="rounded-full border border-amber-300/20 bg-amber-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">
                        Jigzack Employee Setup
                    </span>

                    <h1 className="mt-5 text-3xl font-black tracking-tight md:text-4xl">
                        Let&apos;s verify your details
                    </h1>

                    <p className="mt-4 max-w-2xl text-sm leading-6 text-white/65 md:text-base">
                        A few contact details so admin can verify and approve your account.
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <SectionCard
                        icon={User}
                        title="Contact Information"
                        subtitle="Used for admin verification before your account is approved."
                    >
                        <div className="grid gap-5 md:grid-cols-2">
                            <div>
                                <FieldLabel required>Full Name</FieldLabel>
                                <TextInput
                                    value={form.fullName}
                                    onChange={(value) => updateField("fullName", value)}
                                    placeholder="Your full name"
                                />
                            </div>

                            <div>
                                <FieldLabel required>Phone Number</FieldLabel>
                                <TextInput
                                    value={form.phone}
                                    onChange={(value) => updateField("phone", value)}
                                    placeholder="Phone number"
                                />
                            </div>
                        </div>
                    </SectionCard>

                    <SectionCard
                        icon={MapPin}
                        title="Address"
                        subtitle="Where you're based, for scheduling and verification."
                    >
                        <div className="grid gap-5 md:grid-cols-2">
                            <div className="md:col-span-2">
                                <FieldLabel required>Home Address</FieldLabel>
                                <TextInput
                                    value={form.address}
                                    onChange={(value) => updateField("address", value)}
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
                        </div>
                    </SectionCard>

                    <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
                        <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                            <input
                                type="checkbox"
                                checked={form.agreed}
                                onChange={(e) => updateField("agreed", e.target.checked)}
                                className="mt-1 h-4 w-4 rounded border-white/20 bg-transparent text-amber-300"
                            />
                            <span className="text-sm leading-6 text-white/75">
                                I confirm that the details provided are correct and can be used for account verification.
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
                </form>
            </div>
        </div>
    );
}
