import { requireDashboardAccess } from "@/lib/dashboard/requireDashboardAccess";
import { naira, resolveBilling } from "@/lib/customer/billing";
import DashboardShell from "@/components/dashboard/DashboardShell";
import SectionCard from "@/components/dashboard/SectionCard";
import InvoiceList, { type InvoiceRow } from "@/components/dashboard/InvoiceList";
import { amountPaid, balanceOf, groupInstallments, invoiceTotal, loadInstallments } from "@/lib/billing/balance";

export default async function CustomerPaymentsPage() {
    const { profile, supabase, unreadCount, customer } = await requireDashboardAccess("customer");
    const { billingProfileId, isTenant } = await resolveBilling(supabase, profile.id, customer);

    // "*" includes the transfer and part payment columns once they exist, so the
    // page works before and after those SQL files have been run.
    const { data: invoicesData } = await supabase
        .from("payments")
        .select("*")
        .eq("customer_id", billingProfileId)
        .order("created_at", { ascending: false });

    const invoices = (invoicesData ?? []) as InvoiceRow[];

    const installments = await loadInstallments(supabase, invoices.map((invoice) => invoice.id));
    const byInvoice = groupInstallments(installments);

    // Money still owed is what is left on each invoice after the payments made.
    const totals = invoices.reduce(
        (acc, invoice) => {
            acc.billed += invoiceTotal(invoice);
            acc.paid += amountPaid(invoice);
            acc.outstanding += balanceOf(invoice);
            return acc;
        },
        { billed: 0, paid: 0, outstanding: 0 }
    );

    return (
        <DashboardShell
            role="customer"
            profileId={profile.id}
            title="Payments"
            subtitle="Every invoice, its status, and a receipt for each payment you've made."
            unreadCount={unreadCount}
        >
            <SectionCard
                title="Invoices"
                description={
                    isTenant
                        ? "Your estate's shared utility bill. View or print any invoice or receipt."
                        : "View or print any invoice, and a receipt for every payment you've made."
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

                <InvoiceList
                    invoices={invoices}
                    canReport={!isTenant}
                    installments={Object.fromEntries(byInvoice)}
                />
            </SectionCard>
        </DashboardShell>
    );
}
