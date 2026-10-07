"use server";

import { createClient } from "@/utils/supabase/server";
import { getUserProfile } from "@/lib/auth/getUserProfile";
import { billToFilter, cleanTerm, customerFilter, invoiceCode, invoiceIdRange } from "@/lib/admin/search";
import { billToOf } from "@/lib/billing/billTo";
import { invoiceNumber, naira } from "@/lib/customer/billing";
import { invoiceTotal } from "@/lib/billing/balance";

export type SearchHit = { kind: "customer" | "invoice"; title: string; detail: string; href: string };

// The matches, and a plain message if part of the lookup failed.
export type SearchResult = { hits: SearchHit[]; error?: string };

const LIMIT = 6;

// Finds customers (by name, email, phone, address, account or property code)
// and invoices (by invoice number, or by the person it is for) for the
// dashboard search. Any admin may search, including view-only ones; customers
// in Recently deleted are left out.
export async function searchRecords(query: string): Promise<SearchResult> {
    const profile = await getUserProfile();

    if (profile.role !== "admin" || (profile as { status?: string }).status === "pending") return { hits: [] };

    const term = cleanTerm(String(query ?? ""));
    if (term.length < 2) return { hits: [] };

    const supabase = await createClient();
    const hits: SearchHit[] = [];
    let failed = false;
    const note = (label: string, error: { message: string } | null) => {
        if (!error) return;
        failed = true;
        console.error(`searchRecords ${label} error:`, error.message);
    };

    const customerQuery = customerFilter(term);
    const { data: customers, error: customerError } = customerQuery
        ? await supabase
            .from("customers")
            .select("profile_id, full_name, email, phone, address, account_code, status")
            .neq("status", "deleted")
            .or(customerQuery)
            .order("full_name", { ascending: true })
            .limit(LIMIT)
        : { data: [], error: null };
    note("customers", customerError);

    for (const c of (customers ?? []) as { profile_id: string; full_name: string | null; email: string | null; phone: string | null; address: string | null; account_code: string | null; status: string | null }[]) {
        hits.push({
            kind: "customer",
            title: c.full_name ?? "Unnamed customer",
            detail: [c.account_code, c.phone, c.email, c.address, c.status === "inactive" ? "suspended" : null].filter(Boolean).join(" · "),
            href: `/admin/customers/${c.profile_id}`,
        });
    }

    // Invoices: by number, and by who they were made out to when that person
    // isn't registered. Registered customers' invoices are found through the customer.
    const code = invoiceCode(term);
    const range = code ? invoiceIdRange(code) : null;
    const billTo = billToFilter(term);

    const invoiceRows = new Map<string, Record<string, unknown>>();
    const select = "*, customer:profiles!payments_customer_id_fkey(full_name)";

    if (range) {
        const { data, error } = await supabase.from("payments").select(select).gte("id", range.from).lte("id", range.to).limit(LIMIT);
        note("invoice number", error);
        for (const row of (data ?? []) as unknown as { id: string }[]) invoiceRows.set(row.id, row);
    }

    if (billTo) {
        const { data, error } = await supabase.from("payments").select(select).is("customer_id", null).or(billTo).order("created_at", { ascending: false }).limit(LIMIT);
        note("unregistered invoices", error);
        for (const row of (data ?? []) as unknown as { id: string }[]) invoiceRows.set(row.id, row);
    }

    for (const row of [...invoiceRows.values()].slice(0, LIMIT) as unknown as {
        id: string;
        status: string | null;
        invoice_month: string | null;
        bill_to?: unknown;
        customer: { full_name: string | null } | null;
        amount: number;
        arrears: number | null;
    }[]) {
        const person = row.customer?.full_name ?? billToOf(row)?.full_name ?? "Unknown";

        hits.push({
            kind: "invoice",
            title: `${invoiceNumber(row.id)} · ${person}`,
            detail: [row.invoice_month, naira(invoiceTotal(row as never)), row.status === "paid" ? "paid" : "unpaid", row.customer ? null : "not registered"].filter(Boolean).join(" · "),
            href: `/admin/invoices/${row.id}`,
        });
    }

    return { hits, ...(failed && hits.length === 0 ? { error: "The search ran into a problem. Please try again." } : {}) };
}
