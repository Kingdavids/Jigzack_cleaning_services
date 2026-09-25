import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getUserProfile } from "@/lib/auth/getUserProfile";
import { BANK_ACCOUNT } from "@/lib/bank-details";
import RegistrationFeeForm from "@/components/auth/RegistrationFeeForm";

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

    // The submitted column arrives with supabase/manual-payments-2026-09.sql;
    // until then treat everyone as not yet reported.
    let result = await supabase
        .from("customers")
        .select("registration_fee_paid, registration_fee_submitted_at, full_name")
        .eq("profile_id", profile.id)
        .maybeSingle();

    if (result.error) {
        result = (await supabase
            .from("customers")
            .select("registration_fee_paid, full_name")
            .eq("profile_id", profile.id)
            .maybeSingle()) as unknown as typeof result;
    }

    const customer = result.data as { registration_fee_paid: boolean; registration_fee_submitted_at?: string | null; full_name: string | null } | null;

    if (!customer) {
        redirect("/auth/customer-setup");
    }

    if (customer.registration_fee_paid) {
        redirect("/customer");
    }

    const reported = Boolean(customer.registration_fee_submitted_at);

    return (
        <div className="flex min-h-screen items-center justify-center bg-[#0a0a0b] px-6 py-10 text-white">
            <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
                <span className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-400/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.22em] text-amber-300">
                    One-time fee
                </span>

                <h1 className="mt-6 text-2xl font-black tracking-tight">Activate your account</h1>

                <p className="mt-3 text-sm leading-6 text-white/60">
                    Hi {customer.full_name ?? profile.full_name ?? "there"}, a one-off registration fee of{" "}
                    <span className="font-bold text-white">₦{REGISTRATION_FEE_NGN.toLocaleString()}</span> completes your signup and
                    unlocks your customer dashboard.
                </p>

                <div className="mt-6 rounded-xl border border-white/10 bg-black/25 p-4 text-left">
                    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-white/45">Pay by bank transfer to</p>
                    <p className="mt-2 text-sm font-bold text-red-400">Account name: {BANK_ACCOUNT.name}</p>
                    {BANK_ACCOUNT.banks.map((b) => (
                        <p key={b.bank} className="mt-1 text-sm text-white/85">
                            {b.bank}: <span className="font-bold tracking-wide">{b.number}</span>
                        </p>
                    ))}
                </div>

                {reported ? (
                    <div className="mt-6 rounded-xl border border-emerald-400/30 bg-emerald-400/[0.08] p-4 text-sm leading-6 text-emerald-200">
                        We have your payment report. An admin will confirm it soon, and your dashboard opens as soon as they do.
                    </div>
                ) : (
                    <>
                        <p className="mt-6 text-sm leading-6 text-white/60">
                            After you pay, tap the button below. You can add the name on the transfer and a receipt, but you do not have to.
                        </p>
                        <RegistrationFeeForm />
                    </>
                )}

                {reported && (
                    <details className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4 text-left">
                        <summary className="cursor-pointer text-sm font-semibold text-amber-300">
                            Forgot to attach your receipt? Add it here
                        </summary>
                        <RegistrationFeeForm reported />
                    </details>
                )}

                <p className="mt-6 text-xs text-white/40">
                    Questions? Call us on 0703 433 9721 or email info@jigzack.com.
                </p>
            </div>
        </div>
    );
}
