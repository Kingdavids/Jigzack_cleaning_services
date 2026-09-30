import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getUserProfile } from "@/lib/auth/getUserProfile";
import { loadPrepayment, loadReceipt } from "@/lib/customer/documents";
import PrepaymentReceiptDocument from "@/components/dashboard/PrepaymentReceiptDocument";
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

    // Row security alone decides whether this receipt belongs to them: their
    // own, their estate's as a tenant, or a property linked to their login. A
    // receipt for someone else's payment simply comes back empty.

    // An advance payment has its own receipt.
    const prepayment = await loadPrepayment(supabase, id);

    if (prepayment) {
        const { data: billingCustomer } = await supabase.from("customers").select("*").eq("profile_id", prepayment.customer_id).maybeSingle();

        return (
            <PrepaymentReceiptDocument
                prepayment={prepayment}
                customer={billingCustomer}
                fallbackName={profile.full_name}
                basePath="/customer"
            />
        );
    }

    const found = await loadReceipt(supabase, id);

    if (!found) {
        redirect("/customer/payments");
    }

    const { payment, installment, installments } = found;

    // A receipt only exists for money that has been received. An invoice with
    // payments against it has one receipt per payment, listed on the invoice.
    if (!installment && (payment.status !== "paid" || installments.length > 0)) {
        redirect(`/customer/invoices/${payment.id}`);
    }

    const { data: billingCustomer } = await supabase.from("customers").select("*").eq("profile_id", payment.customer_id).maybeSingle();

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
