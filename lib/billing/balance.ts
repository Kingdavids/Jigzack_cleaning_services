import type { SupabaseClient } from "@supabase/supabase-js";

// What an invoice is worth, what has been paid against it, and what is left.
// The database keeps the running total in payments.amount_paid; invoices paid
// before part payments existed count as fully paid.

export type Payable = {
    amount: number | string | null;
    arrears?: number | string | null;
    status?: string | null;
    amount_paid?: number | string | null;
};

export const round2 = (value: number) => Math.round(value * 100) / 100;

export function invoiceTotal(row: Payable) {
    return round2(Number(row.amount ?? 0) + Number(row.arrears ?? 0));
}

export function amountPaid(row: Payable) {
    const total = invoiceTotal(row);
    if (row.status === "paid") return total;
    return Math.min(round2(Number(row.amount_paid ?? 0)), total);
}

export function balanceOf(row: Payable) {
    return Math.max(round2(invoiceTotal(row) - amountPaid(row)), 0);
}

// Loads invoices with amount_paid, or without it if the part payments SQL has
// not been run yet. `run` builds the query for a given column list.
export async function loadWithPaid(
    run: (select: string) => PromiseLike<{ data: unknown; error: unknown }>,
    columns: string
) {
    const first = await run(`${columns}, amount_paid`);
    if (!first.error) return (first.data ?? []) as unknown[];

    const second = await run(columns);
    return (second.data ?? []) as unknown[];
}

export type Installment = {
    id: string;
    payment_id: string;
    amount: number | string;
    balance_after: number | string;
    method: string | null;
    reference: string | null;
    note: string | null;
    paid_at: string;
};

// Payments received against the given invoices, oldest first. Empty (not an
// error) if the table does not exist yet.
export async function loadInstallments(supabase: SupabaseClient, paymentIds: string[]): Promise<Installment[]> {
    if (paymentIds.length === 0) return [];

    const { data, error } = await supabase
        .from("payment_installments")
        .select("id, payment_id, amount, balance_after, method, reference, note, paid_at")
        .in("payment_id", paymentIds)
        .order("paid_at", { ascending: true });

    return error ? [] : ((data ?? []) as Installment[]);
}

// Payments recorded on or after a moment, for "collected this month".
export async function loadInstallmentsSince(supabase: SupabaseClient, since: string): Promise<Pick<Installment, "amount" | "payment_id">[]> {
    const { data, error } = await supabase.from("payment_installments").select("amount, payment_id").gte("paid_at", since);

    return error ? [] : ((data ?? []) as Pick<Installment, "amount" | "payment_id">[]);
}

export function groupInstallments(list: Installment[]) {
    const map = new Map<string, Installment[]>();

    for (const item of list) {
        map.set(item.payment_id, [...(map.get(item.payment_id) ?? []), item]);
    }

    return map;
}
