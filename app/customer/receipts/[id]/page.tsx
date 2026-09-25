import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getUserProfile } from "@/lib/auth/getUserProfile";
import { resolveBilling } from "@/lib/customer/billing";
import { loadReceipt } from "@/lib/customer/documents";
import ReceiptDocument from "@/components/dashboard/ReceiptDocument";

export default async function CustomerReceiptPage({
                                                      params,
                                                  }: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const profile = await getUserProfile();

    if (profile.role !== "customer") {
        redirect(`/${profile.role}`);
    }

    const supabase = await createClient();

    const { data: customer } = await supabase
        .from("customers")
        .select("*")
        .eq("profile_id", profile.id)
        .single();

    const { billingProfileId, billingCustomer } = await resolveBilling(supabase, profile.id, customer);

    const found = await loadReceipt(supabase, id);

    if (!found || found.payment.customer_id !== billingProfileId) {
        redirect("/customer/payments");
    }

    const { payment, installment, installments } = found;

    // A receipt only exists for money that has been received. An invoice with
    // payments against it has one receipt per payment, listed on the invoice.
    if (!installment && (payment.status !== "paid" || installments.length > 0)) {
        redirect(`/customer/invoices/${payment.id}`);
    }

    return (
        <ReceiptDocument
            payment={payment}
            installment={installment}
            installments={installments}
            customer={billingCustomer}
            fallbackName={profile.full_name}
            basePath="/customer"
        />
    );
}
