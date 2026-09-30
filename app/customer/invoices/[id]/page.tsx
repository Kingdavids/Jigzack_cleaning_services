import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getUserProfile } from "@/lib/auth/getUserProfile";
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

    // Row security alone decides whether this invoice belongs to them: their
    // own, their estate's as a tenant, or a property linked to their login.
    const { data: invoice } = await supabase.from("payments").select("*").eq("id", id).maybeSingle();

    if (!invoice || !invoice.customer_id) {
        redirect("/customer/payments");
    }

    const { data: billingCustomer } = await supabase.from("customers").select("*").eq("profile_id", invoice.customer_id).maybeSingle();

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
