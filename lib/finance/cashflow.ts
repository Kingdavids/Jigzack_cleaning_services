import type { SupabaseClient } from "@supabase/supabase-js";
import { invoiceTotal } from "@/lib/billing/balance";
import { EXPENSE_CATEGORIES } from "@/lib/expenses";
import { REGISTRATION_FEE_NGN, TIMEZONE, TIMEZONE_OFFSET } from "@/lib/config/business";

// Money that came in and went out, month by month (Lagos time), sorted into
// categories. Money in is counted when it was received; staff spending is
// counted in the month it was spent, once an admin has approved it.

export const INFLOW_SOURCES = [
    { key: "monthly", label: "Monthly service (automatic invoices)" },
    { key: "manual", label: "Invoices made or edited by hand" },
    { key: "unregistered", label: "Customers not registered on the app" },
    { key: "recyclables", label: "Recyclables sales" },
    { key: "advance", label: "Advance payments" },
    { key: "registration", label: "Registration fees" },
] as const;

export type InflowSource = (typeof INFLOW_SOURCES)[number]["key"];

export type MonthFlow = {
    month: string; // "YYYY-MM"
    inBySource: Record<InflowSource, { amount: number; count: number }>;
    inByMethod: Record<string, number>;
    inTotal: number;
    outByCategory: Record<string, { amount: number; count: number }>;
    outTotal: number;
    // Claims not yet approved: shown, but not counted as money out.
    waiting: { amount: number; count: number };
};


const lagosMonth = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: TIMEZONE }).slice(0, 7);

// "2026-10" and the 5 months before it, oldest first.
export function monthsEndingAt(last: string, count = 6) {
    const [y, m] = last.split("-").map(Number);
    return Array.from({ length: count }, (_, i) => new Date(Date.UTC(y, m - count + i, 1)).toISOString().slice(0, 7));
}

export const monthName = (key: string) => {
    const [y, m] = key.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, 15)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
};

function emptyMonth(month: string): MonthFlow {
    return {
        month,
        inBySource: Object.fromEntries(INFLOW_SOURCES.map((s) => [s.key, { amount: 0, count: 0 }])) as MonthFlow["inBySource"],
        inByMethod: {},
        inTotal: 0,
        outByCategory: Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c.value, { amount: 0, count: 0 }])),
        outTotal: 0,
        waiting: { amount: 0, count: 0 },
    };
}

type InvoiceRef = {
    id: string;
    customer_id: string | null;
    auto_generated: boolean | null;
    bill_to: unknown;
    payment_method: string | null;
    invoice_kind?: string | null;
};

// A recyclables sale is its own source; otherwise by who it was for and how it was made.
const sourceOf = (invoice: InvoiceRef | undefined): InflowSource =>
    !invoice
        ? "manual"
        : invoice.invoice_kind === "recyclables"
            ? "recyclables"
            : !invoice.customer_id && invoice.bill_to
                ? "unregistered"
                : invoice.auto_generated
                    ? "monthly"
                    : "manual";

const INVOICE_COLUMNS = "id, customer_id, auto_generated, bill_to, payment_method";

// Split a long id list so each request stays short.
async function inChunks<T>(ids: string[], load: (chunk: string[]) => PromiseLike<{ data: T[] | null }>) {
    const rows: T[] = [];
    for (let i = 0; i < ids.length; i += 80) rows.push(...((await load(ids.slice(i, i + 80))).data ?? []));
    return rows;
}

export async function loadCashflow(supabase: SupabaseClient, months: string[]): Promise<MonthFlow[]> {
    const flows = new Map(months.map((m) => [m, emptyMonth(m)]));
    const first = months[0];
    const [ly, lm] = months[months.length - 1].split("-").map(Number);
    const after = new Date(Date.UTC(ly, lm, 1)).toISOString().slice(0, 7);
    const from = `${first}-01T00:00:00${TIMEZONE_OFFSET}`;
    const until = `${after}-01T00:00:00${TIMEZONE_OFFSET}`;

    const addIn = (iso: string | null, source: InflowSource, method: string | null, amount: number) => {
        const flow = iso ? flows.get(lagosMonth(iso)) : undefined;
        if (!flow || !(amount > 0)) return;
        flow.inBySource[source].amount += amount;
        flow.inBySource[source].count += 1;
        const how = method?.trim() || "Not recorded";
        flow.inByMethod[how] = (flow.inByMethod[how] ?? 0) + amount;
        flow.inTotal += amount;
    };

    // 1. Each payment recorded against an invoice (part or full).
    const { data: installmentData, error: installmentError } = await supabase
        .from("payment_installments")
        .select("payment_id, amount, method, paid_at")
        .gte("paid_at", from)
        .lt("paid_at", until);
    const installments = installmentError ? [] : ((installmentData ?? []) as { payment_id: string; amount: number; method: string | null; paid_at: string }[]);

    const invoiceIds = [...new Set(installments.map((i) => i.payment_id))];
    // invoice_kind comes from the trading SQL; without it every invoice reads as before.
    const invoices = new Map(
        (
            await inChunks<InvoiceRef>(invoiceIds, async (chunk) => {
                const withKind = await supabase.from("payments").select(`${INVOICE_COLUMNS}, invoice_kind`).in("id", chunk);
                return withKind.error ? supabase.from("payments").select(INVOICE_COLUMNS).in("id", chunk) : withKind;
            })
        ).map((row) => [row.id, row])
    );

    for (const item of installments) {
        const invoice = invoices.get(item.payment_id);
        addIn(item.paid_at, sourceOf(invoice), item.method ?? invoice?.payment_method ?? null, Number(item.amount));
    }

    // 2. Invoices settled in one go before part payments existed: no payment rows.
    //    Ones settled from an advance payment aren't new money; that payment is counted below.
    const paidColumns = "id, amount, arrears, status, paid_at, payment_method, customer_id, auto_generated, bill_to";
    const paidWithKind = await supabase
        .from("payments")
        .select(`${paidColumns}, invoice_kind`)
        .eq("status", "paid")
        .gte("paid_at", from)
        .lt("paid_at", until);
    const { data: paidData } = paidWithKind.error
        ? await supabase.from("payments").select(paidColumns).eq("status", "paid").gte("paid_at", from).lt("paid_at", until)
        : paidWithKind;
    const paidInvoices = ((paidData ?? []) as (InvoiceRef & { amount: number; arrears: number | null; status: string; paid_at: string })[]).filter(
        (row) => row.payment_method !== "Advance payment"
    );
    const withRows = new Set(
        installmentError
            ? []
            : (
                  await inChunks<{ payment_id: string }>(
                      paidInvoices.map((p) => p.id),
                      (chunk) => supabase.from("payment_installments").select("payment_id").in("payment_id", chunk)
                  )
              ).map((row) => row.payment_id)
    );

    for (const invoice of paidInvoices) {
        if (!withRows.has(invoice.id)) addIn(invoice.paid_at, sourceOf(invoice), invoice.payment_method, invoiceTotal(invoice));
    }

    // 3. Advance payments. Nothing (not an error) where that table doesn't exist.
    const { data: advanceData, error: advanceError } = await supabase
        .from("prepayments")
        .select("amount, method, paid_at")
        .gte("paid_at", from)
        .lt("paid_at", until);
    if (!advanceError) {
        for (const p of (advanceData ?? []) as { amount: number; method: string | null; paid_at: string }[]) {
            addIn(p.paid_at, "advance", p.method, Number(p.amount));
        }
    }

    // 4. Registration fees confirmed as paid. Waived fees brought in nothing.
    const { data: feeData } = await supabase
        .from("customers")
        .select("registration_fee_paid_at, registration_fee_reference")
        .eq("registration_fee_paid", true)
        .gte("registration_fee_paid_at", from)
        .lt("registration_fee_paid_at", until);
    for (const fee of (feeData ?? []) as { registration_fee_paid_at: string; registration_fee_reference: string | null }[]) {
        if (/waived/i.test(fee.registration_fee_reference ?? "")) continue;
        addIn(fee.registration_fee_paid_at, "registration", "Bank transfer", REGISTRATION_FEE_NGN);
    }

    // 5. Staff spending, in the month it was spent. Only approved or paid-back
    //    claims count as money out; waiting ones are kept apart; rejected never count.
    const { data: expenseData } = await supabase
        .from("expenses")
        .select("amount, category, status, expense_date")
        .gte("expense_date", `${first}-01`)
        .lt("expense_date", `${after}-01`);
    for (const e of (expenseData ?? []) as { amount: number; category: string; status: string; expense_date: string }[]) {
        const flow = flows.get(e.expense_date.slice(0, 7));
        if (!flow) continue;
        const amount = Number(e.amount);

        if (e.status === "approved" || e.status === "reimbursed") {
            const bucket = (flow.outByCategory[e.category] ??= { amount: 0, count: 0 });
            bucket.amount += amount;
            bucket.count += 1;
            flow.outTotal += amount;
        } else if (e.status === "submitted") {
            flow.waiting.amount += amount;
            flow.waiting.count += 1;
        }
    }

    // 6. Recyclables bought: what was paid for what came in. Nothing (not an
    //    error) before the trading SQL has been run.
    const { data: boughtData, error: boughtError } = await supabase
        .from("recyclable_movements")
        .select("amount, movement_date")
        .eq("direction", "in")
        .gt("amount", 0)
        .gte("movement_date", `${first}-01`)
        .lt("movement_date", `${after}-01`);
    if (!boughtError) {
        for (const row of (boughtData ?? []) as { amount: number | string; movement_date: string }[]) {
            const flow = flows.get(row.movement_date.slice(0, 7));
            if (!flow) continue;
            const amount = Number(row.amount);
            const bucket = (flow.outByCategory.recyclables ??= { amount: 0, count: 0 });
            bucket.amount += amount;
            bucket.count += 1;
            flow.outTotal += amount;
        }
    }

    return months.map((m) => flows.get(m)!);
}
