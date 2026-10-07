import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getUserProfile } from "@/lib/auth/getUserProfile";
import { loadPrepayment, loadReceipt } from "@/lib/customer/documents";
import PrepaymentReceiptDocument from "@/components/dashboard/PrepaymentReceiptDocument";
import ReceiptDocument from "@/components/dashboard/ReceiptDocument";
import { billToOf } from "@/lib/billing/billTo";

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
    const prepayment = await loadPrepayment(supabase, id);

    if (prepayment) {
        const { data: payer } = prepayment.customer_id ? await supabase.from("customers").select("*").eq("profile_id", prepayment.customer_id).maybeSingle() : { data: null };
        // Someone not registered: the details kept on the payment itself.
        const unregistered = prepayment.customer_id ? null : billToOf(prepayment);

        return (
            <PrepaymentReceiptDocument
                prepayment={prepayment}
                customer={payer ?? unregistered}
                fallbackName={payer?.full_name ?? unregistered?.full_name ?? null}
                basePath="/admin"
                previewFor={payer?.full_name ?? unregistered?.full_name ?? null}
            />
        );
    }

    const found = await loadReceipt(supabase, id);

    if (!found) {
        redirect("/admin/payments");
    }

    const { payment, installment, installments } = found;

    if (!installment && (payment.status !== "paid" || installments.length > 0)) {
        redirect(`/admin/invoices/${payment.id}`);
    }

    // Someone not registered on the app has their details on the invoice itself.
    const { data: registered } = payment.customer_id
        ? await supabase.from("customers").select("*").eq("profile_id", payment.customer_id).maybeSingle()
        : { data: null };
    const customer = registered ?? billToOf(payment);

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
