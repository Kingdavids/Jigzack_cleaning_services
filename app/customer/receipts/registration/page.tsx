import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getUserProfile } from "@/lib/auth/getUserProfile";
import RegistrationFeeReceiptDocument from "@/components/dashboard/RegistrationFeeReceiptDocument";

const REGISTRATION_FEE_NGN = Number(process.env.REGISTRATION_FEE_NGN ?? "5000");

export default async function CustomerRegistrationFeeReceiptPage() {
    const profile = await getUserProfile();

    if (profile.role !== "customer") {
        redirect(`/${profile.role}`);
    }

    const supabase = await createClient();
    const { data: customer } = await supabase.from("customers").select("*").eq("profile_id", profile.id).maybeSingle();

    if (!customer || !customer.registration_fee_paid) {
        redirect("/customer/payments");
    }

    return (
        <RegistrationFeeReceiptDocument
            customer={customer}
            fallbackName={customer.full_name ?? profile.full_name ?? null}
            basePath="/customer"
            amount={REGISTRATION_FEE_NGN}
            paidAt={(customer as { registration_fee_paid_at?: string | null }).registration_fee_paid_at ?? null}
            reference={(customer as { registration_fee_reference?: string | null }).registration_fee_reference ?? null}
        />
    );
}
