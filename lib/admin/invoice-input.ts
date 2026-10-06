import { createClient } from "@/utils/supabase/server";
import { itemsTotal, normalizeLineItems, tooEarlyToBill, type LineItem } from "@/lib/billing/pricing";
import { round2 } from "@/lib/billing/balance";
import { todayLagos } from "@/lib/tasks";

// Reading what the admin invoice forms submit, and the checks around a sale of
// recyclables. These are plain functions, not server actions: anything exported
// from a "use server" file is a public endpoint, so they live here instead.

// What an invoice is for: the property's monthly service, a sale of recyclables
// (by the kilogram), or any other service or item.
export type InvoiceKind = "service" | "recyclables" | "other";

export type SaleLine = { material: string; materialNote: string | null; kg: number; price: number };

export const MATERIAL_VALUES = ["plastic", "metal", "paper", "glass", "electronics", "other"];

// What InvoiceBuilder submits: the priced lines, arrears, the months covered,
// the property's unit counts and, for a sale, the weight of each material.
export function readBuiltInvoice(formData: FormData):
    | { error: string }
    | {
          kind: InvoiceKind;
          sales: SaleLine[];
          items: LineItem[];
          amount: number;
          arrears: number;
          invoiceMonth: string | null;
          coveredMonths: string[];
          propertyDetails: Record<string, string>;
      } {
    const rawKind = String(formData.get("invoiceKind") ?? "service");
    const kind: InvoiceKind = rawKind === "recyclables" || rawKind === "other" ? rawKind : "service";
    let sales: SaleLine[] = [];
    let items: LineItem[] = [];
    let coveredMonths: string[] = [];
    let propertyDetails: Record<string, string> = {};

    try {
        items = normalizeLineItems(JSON.parse(String(formData.get("lineItems") || "[]")));
        const months = JSON.parse(String(formData.get("coveredMonths") || "[]"));
        coveredMonths = Array.isArray(months) ? months.map(String).filter(Boolean).slice(0, 24) : [];
        const details = JSON.parse(String(formData.get("propertyDetails") || "{}"));
        propertyDetails = details && typeof details === "object" ? Object.fromEntries(Object.entries(details).map(([k, v]) => [k, String(v)])) : {};

        if (kind === "recyclables") {
            const raw = JSON.parse(String(formData.get("recyclableLines") || "[]"));
            sales = (Array.isArray(raw) ? raw : [])
                .map((line: { material?: unknown; materialNote?: unknown; kg?: unknown; price?: unknown }) => ({
                    material: String(line.material ?? ""),
                    materialNote: String(line.materialNote ?? "").trim().slice(0, 80) || null,
                    kg: round2(Number(line.kg)),
                    price: round2(Number(line.price)),
                }))
                .filter((line) => MATERIAL_VALUES.includes(line.material) && Number.isFinite(line.kg) && line.kg > 0 && Number.isFinite(line.price) && line.price >= 0);

            if (sales.some((line) => line.material === "other" && !line.materialNote)) return { error: "Say what each \"other\" material is." };
        }
    } catch {
        return { error: "The invoice details couldn't be read. Please try again." };
    }

    items = items.filter((item) => item.label && item.quantity > 0);
    if (items.length === 0) {
        return {
            error:
                kind === "recyclables"
                    ? "Add at least one material with its weight and price."
                    : kind === "other"
                        ? "Add at least one item with a name, quantity and price."
                        : "Add the property's units, or another charge, so there is something to bill.",
        };
    }

    const amount = round2(itemsTotal(items));
    if (amount <= 0) return { error: "The charges must add up to more than zero." };

    const arrearsInput = Number(formData.get("arrears") || 0);
    const arrears = Number.isFinite(arrearsInput) && arrearsInput > 0 ? round2(arrearsInput) : 0;

    // A sale or other invoice isn't a month of service: it has no month, and it
    // covers no months, so the automatic monthly invoice is never skipped for it.
    if (kind !== "service") return { kind, sales, items, amount, arrears, invoiceMonth: null, coveredMonths: [], propertyDetails: {} };

    const invoiceMonth = String(formData.get("invoiceMonth") ?? "").trim().slice(0, 60) || null;

    // A single month is only billed from the 25th; several months at once is paying ahead.
    const early = tooEarlyToBill(invoiceMonth);
    if (early) return { error: early };

    return { kind, sales, items, amount, arrears, invoiceMonth, coveredMonths, propertyDetails };
}

// What an invoice says it is for when no description was typed.
export function invoiceDescription(kind: InvoiceKind, month: string | null) {
    return kind === "recyclables" ? "Sale of recyclables" : kind === "other" ? "Services and items" : `Waste management service${month ? `, ${month}` : ""}`;
}

// Why an invoice insert failed, in words an admin can act on.
export function invoiceInsertError(message: string | undefined) {
    if (/invoice_kind/.test(message ?? "")) return "Not switched on yet. Run supabase/recyclables-trading-2026-10.sql in Supabase first.";
    if (/covered_months/.test(message ?? "")) return "Not switched on yet. Run supabase/invoice-months-2026-10.sql in Supabase first.";
    if (/bill_to/.test(message ?? "")) return "Not switched on yet. Run supabase/non-customer-invoices-2026-10.sql in Supabase first.";
    return "Could not create the invoice. Please try again.";
}

// Weight of each material in stock, to make sure a sale never sends out more
// than there is. Null where the recyclables table doesn't exist yet.
export async function stockOf(supabase: Awaited<ReturnType<typeof createClient>>, material: string) {
    const { data, error } = await supabase.from("recyclable_movements").select("direction, kg").eq("material", material).limit(20000);
    if (error) return null;

    return (data ?? []).reduce((sum, r) => sum + (r.direction === "in" ? Number(r.kg) : -Number(r.kg)), 0);
}

export async function checkSaleStock(supabase: Awaited<ReturnType<typeof createClient>>, sales: SaleLine[]): Promise<string | null> {
    const wanted = new Map<string, number>();
    for (const line of sales) wanted.set(line.material, (wanted.get(line.material) ?? 0) + line.kg);

    for (const [material, kg] of wanted) {
        const stock = await stockOf(supabase, material);
        if (stock === null) return "Recyclables tracking isn't switched on. Run supabase/admin-expenses-recyclables-2026-10.sql in Supabase first.";
        if (kg > stock + 0.001) return `Only ${Math.max(0, Math.round(stock * 100) / 100)} kg of ${material} is in stock, and this sale is for ${kg} kg.`;
    }

    return null;
}

// A sale takes its weight out of stock, tied to the invoice so removing the
// invoice puts the stock back. Returns an error (and nothing is left behind).
export async function logSaleMovements(
    supabase: Awaited<ReturnType<typeof createClient>>,
    adminId: string,
    paymentId: string,
    buyer: string | null,
    sales: SaleLine[]
): Promise<string | null> {
    if (sales.length === 0) return null;

    const { error } = await supabase.from("recyclable_movements").insert(
        sales.map((line) => ({
            direction: "out",
            material: line.material,
            material_note: line.material === "other" ? line.materialNote : null,
            kg: line.kg,
            movement_date: todayLagos(),
            party: buyer,
            note: "Sale invoice",
            amount: round2(line.kg * line.price),
            payment_id: paymentId,
            recorded_by: adminId,
        }))
    );

    return error ? error.message : null;
}

// Who an invoice is for, from BillToFields: the person or business, an
// optional property name printed instead of theirs, contact details and the
// address the service is for.
export function readBillTo(formData: FormData, kind: InvoiceKind = "service") {
    const text = (name: string, max = 200) => String(formData.get(name) ?? "").trim().slice(0, max) || null;

    const billTo = {
        full_name: text("fullName", 120),
        property_name: text("propertyName", 120),
        phone: text("phone", 40),
        whatsapp_number: text("whatsapp", 40),
        email: text("email", 160),
        address: text("address", 300),
        landmark: text("landmark", 160),
        lga: text("lga", 80),
        state: text("state", 80),
        property_type: text("propertyType", 40),
    };

    if (!billTo.full_name) return { error: "Enter the name of the person or business being billed." };
    if (!billTo.phone && !billTo.email) return { error: "Enter a phone number or an email address for them." };
    if (kind === "service" && !billTo.address) return { error: "Enter the address the service is for." };
    if (billTo.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(billTo.email)) return { error: "That email address doesn't look right." };

    return { billTo };
}
