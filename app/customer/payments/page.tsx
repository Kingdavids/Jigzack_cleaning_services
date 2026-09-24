import { requireDashboardAccess } from "@/lib/dashboard/requireDashboardAccess";
import { naira, resolveBilling } from "@/lib/customer/billing";
import DashboardShell from "@/components/dashboard/DashboardShell";
import SectionCard from "@/components/dashboard/SectionCard";
import InvoiceList, { type InvoiceRow } from "@/components/dashboard/InvoiceList";

export default async function CustomerPaymentsPage() {
    const { profile, supabase, unreadCount, customer } = await requireDashboardAccess("customer");
    const { billingProfileId, isTenant } = await resolveBilling(supabase, profile.id, customer);

    // transfer_reported_at arrives with supabase/manual-payments-2026-09.sql;
    // until then load the invoices without it so the page never breaks.
    const baseColumns = "id, amount, arrears, description, invoice_month, status, paid_at, payment_method, payment_reference, created_at";

    let invoicesResult = await supabase
        .from("payments")
        .select(`${baseColumns}, transfer_reported_at`)
        .eq("customer_id", billingProfileId)
        .order("created_at", { ascending: false });

    if (invoicesResult.error) {
        invoicesResult = (await supabase
            .from("payments")
            .select(baseColumns)
            .eq("customer_id", billingProfileId)
            .order("created_at", { ascending: false })) as unknown as typeof invoicesResult;
    }

    const invoicesData = invoicesResult.data;

    const invoices = (invoicesData ?? []) as InvoiceRow[];

    const totals = invoices.reduce(
        (acc, invoice) => {
            const amount = Number(invoice.amount ?? 0);
            acc.billed += amount;
            if (invoice.status === "paid") acc.paid += amount;
            else acc.outstanding += amount;
            return acc;
        },
        { billed: 0, paid: 0, outstanding: 0 }
    );

    return (
        <DashboardShell
            role="customer"
            profileId={profile.id}
            title="Payments"
            subtitle="Every invoice, its status, and a receipt once it's paid."
            unreadCount={unreadCount}
        >
            <SectionCard
                title="Invoices"
                description={
                    isTenant
                        ? "Your estate's shared utility bill. View or print any invoice or receipt."
                        : "View or print any invoice, and a receipt for anything you've paid."
                }
            >
                {isTenant && (
                    <div className="mb-4 rounded-xl border border-sky-400/20 bg-sky-400/[0.06] px-4 py-3 text-sm text-sky-200">
                        You&apos;re viewing your estate&apos;s shared utility bill.
                    </div>
                )}

                <div className="mb-5 grid gap-3 sm:grid-cols-3">
                    {[
                        { label: "Total billed", value: naira(totals.billed), tone: "text-white" },
                        { label: "Paid", value: naira(totals.paid), tone: "text-emerald-300" },
                        { label: "Outstanding", value: naira(totals.outstanding), tone: "text-amber-300" },
                    ].map((item) => (
                        <div key={item.label} className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                            <p className="text-xs uppercase tracking-[0.15em] text-white/40">{item.label}</p>
                            <p className={`mt-1 text-xl font-bold ${item.tone}`}>{item.value}</p>
                        </div>
                    ))}
                </div>

                <InvoiceList invoices={invoices} canReport={!isTenant} />
            </SectionCard>
        </DashboardShell>
    );
}
