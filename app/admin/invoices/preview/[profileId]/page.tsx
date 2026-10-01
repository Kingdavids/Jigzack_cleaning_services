import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getUserProfile } from "@/lib/auth/getUserProfile";
import InvoiceDocument from "@/components/dashboard/InvoiceDocument";
import { chargeItems, loadEstateUnits, type BillableCustomer } from "@/lib/billing/generate";
import { itemsTotal, monthLabel } from "@/lib/billing/pricing";

// What this month's invoice would look like if generated right now, worked
// out live from the customer's current details. Once it has been generated,
// this opens the real one instead. Nothing is saved, so this can
// be opened as often as needed while an admin is still setting things up.
export default async function AdminInvoicePreviewForCustomerPage({
                                                                      params,
                                                                  }: {
    params: Promise<{ profileId: string }>;
}) {
    const { profileId } = await params;
    const profile = await getUserProfile();

    if (profile.role !== "admin" || profile.status !== "approved") {
        redirect(`/${profile.role}`);
    }

    const supabase = await createClient();

    const { data: customer } = await supabase.from("customers").select("*").eq("profile_id", profileId).maybeSingle();
    if (!customer) redirect("/admin/payments");

    // Once this month's invoice exists, that is the bill, edits included, so
    // show it rather than a fresh calculation that may no longer match it.
    const { data: existing } = await supabase
        .from("payments")
        .select("id")
        .eq("customer_id", profileId)
        .eq("invoice_month", monthLabel())
        .order("created_at", { ascending: false })
        .limit(1);

    if (existing && existing.length > 0) redirect(`/admin/invoices/${existing[0].id}`);

    const units = customer.is_estate ? await loadEstateUnits(supabase, profileId) : undefined;
    const items = chargeItems(customer as unknown as BillableCustomer, units);
    const month = monthLabel();

    const invoice = {
        id: "preview",
        amount: itemsTotal(items),
        arrears: Number((customer as { arrears?: number | string | null }).arrears ?? 0) || 0,
        units: items.reduce((sum, item) => sum + item.quantity, 0) || 1,
        status: "pending",
        amount_paid: 0,
        description: `Waste management service charge, ${month}`,
        invoice_month: month,
        line_items: items,
        created_at: new Date().toISOString(),
    };

    return (
        <InvoiceDocument
            invoice={invoice}
            customer={customer}
            fallbackName={customer.full_name ?? null}
            installments={[]}
            basePath="/admin"
            previewFor={customer.full_name ? `${customer.full_name} (not generated yet)` : "not generated yet"}
        />
    );
}
