import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getUserProfile } from "@/lib/auth/getUserProfile";
import RegistrationFeeReceiptDocument from "@/components/dashboard/RegistrationFeeReceiptDocument";
import { REGISTRATION_FEE_NGN } from "@/lib/config/business";


// What the customer sees for their registration fee receipt, opened from the
// admin side. It is the same document, read only.
export default async function AdminRegistrationFeeReceiptPage({
                                                                   params,
                                                               }: {
    params: Promise<{ profileId: string }>;
}) {
    const { profileId } = await params;
    const profile = await getUserProfile();

    if (profile.role !== "admin" || profile.status !== "approved") {
        redirect(`/${profile.role}`);
    }

    const supabase = await createClient();
    const { data: customer } = await supabase.from("customers").select("*").eq("profile_id", profileId).maybeSingle();

    if (!customer || !customer.registration_fee_paid) {
        redirect("/admin/payments");
    }

    return (
        <RegistrationFeeReceiptDocument
            customer={customer}
            fallbackName={customer.full_name ?? null}
            basePath="/admin"
            previewFor={customer.full_name ?? null}
            amount={REGISTRATION_FEE_NGN}
            paidAt={(customer as { registration_fee_paid_at?: string | null }).registration_fee_paid_at ?? null}
            reference={(customer as { registration_fee_reference?: string | null }).registration_fee_reference ?? null}
        />
    );
}
