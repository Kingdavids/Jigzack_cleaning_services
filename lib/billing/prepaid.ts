import type { SupabaseClient } from "@supabase/supabase-js";
import { MONTH_NAMES } from "@/lib/billing/schedule";

// Customers who paid upfront for a run of months. The months they cover get no
// invoice, and the payment has its own receipt.

export type Prepayment = {
    id: string;
    customer_id: string;
    months: number;
    amount: number | string;
    covered_months: string[];
    method: string | null;
    reference: string | null;
    note: string | null;
    settled_payment_ids: string[] | null;
    paid_at: string;
};

// "October 2026", the way invoices name their month. Anchored to UTC so it
// never shifts by a day at the edge of a month.
export const monthNameOf = (year: number, monthIndex: number) =>
    new Date(Date.UTC(year, monthIndex, 1)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

// The months a payment covers, starting from "YYYY-MM".
export function coveredMonthsFrom(firstMonth: string, months: number) {
    const [year, month] = firstMonth.split("-").map(Number);

    return Array.from({ length: months }, (_, i) => monthNameOf(year, month - 1 + i));
}

export const currentMonthValue = (now: Date = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

// Advance payments for one customer, newest first. Empty (not an error) before
// the prepayments table exists.
export async function loadPrepayments(supabase: SupabaseClient, customerId: string): Promise<Prepayment[]> {
    const { data, error } = await supabase
        .from("prepayments")
        .select("*")
        .eq("customer_id", customerId)
        .order("paid_at", { ascending: false });

    return error ? [] : ((data ?? []) as Prepayment[]);
}

export async function isMonthPrepaid(supabase: SupabaseClient, customerId: string, monthName: string) {
    const { data, error } = await supabase
        .from("prepayments")
        .select("id")
        .eq("customer_id", customerId)
        .contains("covered_months", [monthName])
        .limit(1);

    return !error && Boolean(data && data.length > 0);
}

// "Prepaid until March 2027" for a customer whose cover reaches this month or later.
export function prepaidUntil(prepayments: Prepayment[], now: Date = new Date()) {
    const current = monthNameOf(now.getFullYear(), now.getMonth());
    const covered = prepayments.flatMap((p) => p.covered_months);

    if (covered.length === 0) return null;

    const stamp = (name: string) => {
        const [monthName, year] = name.split(" ");
        return Number(year) * 12 + MONTH_NAMES.indexOf(monthName);
    };

    const nowStamp = stamp(current);
    const live = covered.filter((name) => stamp(name) >= nowStamp);

    if (live.length === 0) return null;

    return live.reduce((latest, name) => (stamp(name) > stamp(latest) ? name : latest));
}
