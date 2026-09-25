import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getUserProfile } from "@/lib/auth/getUserProfile";
import { loadInstallments } from "@/lib/billing/balance";
import InvoiceDocument from "@/components/dashboard/InvoiceDocument";

// What the customer sees for this invoice, opened from the admin side. It is
// the same document, read only.
export default async function AdminInvoicePreviewPage({
                                                          params,
                                                      }: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const profile = await getUserProfile();

    if (profile.role !== "admin" || profile.status !== "approved") {
        redirect(`/${profile.role}`);
    }

    const supabase = await createClient();

    const { data: invoice } = await supabase.from("payments").select("*").eq("id", id).maybeSingle();

    if (!invoice) {
        redirect("/admin/payments");
    }

    const { data: customer } = await supabase.from("customers").select("*").eq("profile_id", invoice.customer_id).maybeSingle();
    const installments = await loadInstallments(supabase, [invoice.id]);

    return (
        <InvoiceDocument
            invoice={invoice}
            customer={customer}
            fallbackName={customer?.full_name ?? null}
            installments={installments}
            basePath="/admin"
            previewFor={customer?.full_name ?? null}
        />
    );
}
