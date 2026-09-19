"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { getUserProfile } from "@/lib/auth/getUserProfile";

export type PaymentActionState = { success: boolean; error?: string } | null;

export async function verifyRegistrationPayment(reference: string): Promise<PaymentActionState> {
    if (!reference) {
        return { success: false, error: "Missing payment reference." };
    }

    const profile = await getUserProfile();
    const supabase = await createClient();

    const secretKey = process.env.PAYSTACK_SECRET_KEY;

    if (!secretKey) {
        console.error("PAYSTACK_SECRET_KEY is not configured.");
        return { success: false, error: "Payments aren't configured yet. Contact support." };
    }

    const response = await fetch(
        `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
        {
            headers: { Authorization: `Bearer ${secretKey}` },
            cache: "no-store",
        }
    );

    if (!response.ok) {
        console.error("Paystack verify request failed:", response.status);
        return { success: false, error: "Could not verify payment with Paystack. Please try again." };
    }

    const result = await response.json();

    if (!result?.status || result.data?.status !== "success") {
        return { success: false, error: "Payment was not successful." };
    }

    const expectedKobo = Number(process.env.REGISTRATION_FEE_NGN ?? "0") * 100;

    if (expectedKobo > 0 && result.data.amount !== expectedKobo) {
        console.error(
            `Paystack amount mismatch for profile ${profile.id}: got ${result.data.amount}, expected ${expectedKobo}`
        );
        return { success: false, error: "Payment amount did not match the registration fee." };
    }

    const { error } = await supabase.rpc("mark_registration_fee_paid", { p_reference: reference });

    if (error) {
        console.error("mark_registration_fee_paid error:", error.message);
        return { success: false, error: "Payment verified but could not be recorded. Contact support." };
    }

    revalidatePath("/customer");
    revalidatePath("/auth/registration-fee");

    return { success: true };
}
