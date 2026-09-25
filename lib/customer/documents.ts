import type { SupabaseClient } from "@supabase/supabase-js";
import { loadInstallments, type Installment } from "@/lib/billing/balance";

// Finds what a receipt link points at. The id is either one payment's id (each
// payment against an invoice has its own receipt) or, for invoices settled
// before part payments existed, the invoice's own id.
export async function loadReceipt(supabase: SupabaseClient, id: string) {
    // The table may not exist yet, in which case this is simply not an installment.
    const { data: found } = await supabase
        .from("payment_installments")
        .select("id, payment_id, amount, balance_after, method, reference, note, paid_at")
        .eq("id", id)
        .maybeSingle();

    const installment = (found ?? null) as Installment | null;

    const { data: payment } = await supabase
        .from("payments")
        .select("*")
        .eq("id", installment ? installment.payment_id : id)
        .maybeSingle();

    if (!payment) return null;

    const installments = await loadInstallments(supabase, [payment.id as string]);

    return { payment, installment, installments };
}
