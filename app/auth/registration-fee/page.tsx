import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getUserProfile } from "@/lib/auth/getUserProfile";
import PaystackPayButton from "@/components/auth/PaystackPayButton";

const REGISTRATION_FEE_NGN = Number(process.env.REGISTRATION_FEE_NGN ?? "5000");

export default async function RegistrationFeePage() {
    const profile = await getUserProfile();

    if (profile.role !== "customer") {
        redirect(`/${profile.role}`);
    }

    if (profile.status !== "approved") {
        redirect("/auth/pending");
    }

    const supabase = await createClient();

    const { data: customer } = await supabase
        .from("customers")
        .select("registration_fee_paid, email, full_name")
        .eq("profile_id", profile.id)
        .single();

    if (!customer) {
        redirect("/auth/customer-setup");
    }

    if (customer.registration_fee_paid) {
        redirect("/customer");
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-[#0a0a0b] px-6 text-white">
            <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
                <span className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-400/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.22em] text-amber-300">
                    One-time fee
                </span>

                <h1 className="mt-6 text-2xl font-black tracking-tight">Activate your account</h1>

                <p className="mt-3 text-sm leading-6 text-white/60">
                    Hi {customer.full_name ?? profile.full_name ?? "there"}, a one-off registration fee of{" "}
                    <span className="font-bold text-white">₦{REGISTRATION_FEE_NGN.toLocaleString()}</span>{" "}
                    completes your signup and unlocks your customer dashboard.
                </p>

                <PaystackPayButton
                    email={customer.email ?? profile.email ?? ""}
                    amountKobo={REGISTRATION_FEE_NGN * 100}
                    publicKey={process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY ?? ""}
                />

                <p className="mt-4 text-xs text-white/40">
                    Payments are processed securely by Paystack. You&apos;ll be redirected back here once complete.
                </p>
            </div>
        </div>
    );
}
