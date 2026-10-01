import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getUserProfile } from "@/lib/auth/getUserProfile";
import { loadInstallments, loadUnpaidInvoices } from "@/lib/billing/balance";
import InvoiceDocument from "@/components/dashboard/InvoiceDocument";
import { billToOf } from "@/lib/billing/billTo";

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

    // Someone not registered on the app has their details on the invoice itself.
    const { data: registered } = invoice.customer_id
        ? await supabase.from("customers").select("*").eq("profile_id", invoice.customer_id).maybeSingle()
        : { data: null };
    const customer = registered ?? billToOf(invoice);
    const installments = await loadInstallments(supabase, [invoice.id]);
    const earlierUnpaid = invoice.customer_id
        ? (await loadUnpaidInvoices(supabase, invoice.customer_id)).filter((other) => other.id !== invoice.id && other.created_at < invoice.created_at)
        : [];

    return (
        <InvoiceDocument
            invoice={invoice}
            customer={customer}
            fallbackName={customer?.full_name ?? null}
            installments={installments}
            basePath="/admin"
            previewFor={customer?.full_name ?? null}
            earlierUnpaid={earlierUnpaid}
        />
    );
}
