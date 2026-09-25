import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getUserProfile } from "@/lib/auth/getUserProfile";
import { resolveBilling } from "@/lib/customer/billing";
import { loadInstallments } from "@/lib/billing/balance";
import InvoiceDocument from "@/components/dashboard/InvoiceDocument";

export default async function CustomerInvoicePage({
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

    const { data: invoice } = await supabase
        .from("payments")
        .select("*")
        .eq("id", id)
        .eq("customer_id", billingProfileId)
        .single();

    if (!invoice) {
        redirect("/customer/payments");
    }

    const installments = await loadInstallments(supabase, [invoice.id]);

    return (
        <InvoiceDocument
            invoice={invoice}
            customer={billingCustomer}
            fallbackName={profile.full_name}
            installments={installments}
            basePath="/customer"
        />
    );
}
