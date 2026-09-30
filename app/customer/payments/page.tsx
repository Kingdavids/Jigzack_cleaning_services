import { cookies } from "next/headers";
import { requireDashboardAccess } from "@/lib/dashboard/requireDashboardAccess";
import { naira, resolveBilling } from "@/lib/customer/billing";
import DashboardShell from "@/components/dashboard/DashboardShell";
import SectionCard from "@/components/dashboard/SectionCard";
import InvoiceList, { type InvoiceRow } from "@/components/dashboard/InvoiceList";
import { amountPaid, balanceOf, groupInstallments, invoiceTotal, loadInstallments } from "@/lib/billing/balance";
import { loadPrepayments, prepaidUntil } from "@/lib/billing/prepaid";
import { discountInfo, loadEstateUnits, type DiscountableCustomer } from "@/lib/billing/generate";
import Link from "next/link";
import { Receipt } from "lucide-react";
import { formatDate } from "@/lib/customer/billing";
import PropertySwitcher from "@/components/dashboard/PropertySwitcher";
import { ACTIVE_PROPERTY_COOKIE, loadCombinedOutstanding, loadMyProperties, resolveActiveProperty } from "@/lib/dashboard/propertyLinks";

export default async function CustomerPaymentsPage({ searchParams }: { searchParams: Promise<{ property?: string }> }) {
    const { property: queryProperty } = await searchParams;
    const requestedProperty = queryProperty ?? (await cookies()).get(ACTIVE_PROPERTY_COOKIE)?.value;
    const { profile, supabase, unreadCount, customer: ownCustomer } = await requireDashboardAccess("customer");

    const myProperties = await loadMyProperties(supabase, profile.id, { full_name: ownCustomer?.full_name ?? null, address: ownCustomer?.address ?? null });
    const { activeProfileId, isLinked } = await resolveActiveProperty(supabase, profile.id, requestedProperty);

    const customer = isLinked ? (await supabase.from("customers").select("*").eq("profile_id", activeProfileId).maybeSingle()).data : ownCustomer;

    const { billingProfileId, billingCustomer, isTenant } = await resolveBilling(supabase, activeProfileId, customer);

    // Only queried once there is actually more than one property, since it is
    // otherwise the exact same figure the totals below already show.
    const combinedOutstanding =
        myProperties.length > 1 ? await loadCombinedOutstanding(supabase, myProperties.map((p) => p.profileId)) : null;

    // An estate's own units, so a discount reads against their real per-unit
    // priced total rather than the older count-based one.
    const estateUnits = billingCustomer?.is_estate ? await loadEstateUnits(supabase, billingProfileId) : undefined;
    const discount = discountInfo(billingCustomer as unknown as DiscountableCustomer, estateUnits);

    // "*" includes the transfer and part payment columns once they exist, so the
    // page works before and after those SQL files have been run.
    const { data: invoicesData } = await supabase
        .from("payments")
        .select("*")
        .eq("customer_id", billingProfileId)
        .order("created_at", { ascending: false });

    const invoices = (invoicesData ?? []) as InvoiceRow[];

    // Months paid for in advance. Empty before the prepayments SQL has been run.
    const prepayments = isTenant ? [] : await loadPrepayments(supabase, activeProfileId);
    const paidUpTo = prepaidUntil(prepayments);

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
                {combinedOutstanding !== null && (
                    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm">
                        <span className="text-white/60">
                            Across all {myProperties.length} of your properties:{" "}
                            <span className="font-bold text-amber-300">{naira(combinedOutstanding)}</span> owed
                        </span>
                        <PropertySwitcher properties={myProperties} activeProfileId={activeProfileId} />
                    </div>
                )}

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

                {discount && (
                    <div className="mb-5 rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.06] p-4">
                        <p className="font-bold text-emerald-200">You&apos;re on a {discount.percent}% discount</p>
                        <p className="mt-1 text-sm text-white/60">
                            {discount.reason ? discount.reason : "Applied automatically to your monthly charge."} It shows as its own line on your invoice.
                        </p>
                    </div>
                )}

                {prepayments.length > 0 && (
                    <div className="mb-5 rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.06] p-4">
                        <p className="font-bold text-emerald-200">
                            {paidUpTo ? `Paid in advance until ${paidUpTo}` : "Paid in advance"}
                        </p>
                        <p className="mt-1 text-sm text-white/60">No invoices are made for the months you have paid for.</p>
                        <ul className="mt-3 space-y-2">
                            {prepayments.map((p) => (
                                <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                                    <span className="font-semibold text-white">{naira(Number(p.amount))}</span>
                                    <span className="text-white/70">
                                        {p.months} month{p.months === 1 ? "" : "s"}: {p.covered_months[0]}
                                        {p.covered_months.length > 1 ? ` to ${p.covered_months[p.covered_months.length - 1]}` : ""}
                                    </span>
                                    <span className="text-xs text-white/40">Received {formatDate(p.paid_at)}</span>
                                    <Link
                                        href={`/customer/receipts/${p.id}`}
                                        className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 px-3 py-1.5 text-xs font-bold text-black transition hover:bg-amber-300"
                                    >
                                        <Receipt className="h-3.5 w-3.5" />
                                        Receipt
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                <InvoiceList
                    invoices={invoices}
                    canReport={!isTenant && !isLinked}
                    installments={Object.fromEntries(byInvoice)}
                />
            </SectionCard>
        </DashboardShell>
    );
}
