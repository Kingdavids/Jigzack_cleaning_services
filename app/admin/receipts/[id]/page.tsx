import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getUserProfile } from "@/lib/auth/getUserProfile";
import { loadReceipt } from "@/lib/customer/documents";
import ReceiptDocument from "@/components/dashboard/ReceiptDocument";

// What the customer sees for this receipt, opened from the admin side. It is
// the same document, read only.
export default async function AdminReceiptPreviewPage({
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
    const found = await loadReceipt(supabase, id);

    if (!found) {
        redirect("/admin/payments");
    }

    const { payment, installment, installments } = found;

    if (!installment && (payment.status !== "paid" || installments.length > 0)) {
        redirect(`/admin/invoices/${payment.id}`);
    }

    const { data: customer } = await supabase.from("customers").select("*").eq("profile_id", payment.customer_id).maybeSingle();

    return (
        <ReceiptDocument
            payment={payment}
            installment={installment}
            installments={installments}
            customer={customer}
            fallbackName={customer?.full_name ?? null}
            basePath="/admin"
            previewFor={customer?.full_name ?? null}
        />
    );
}
