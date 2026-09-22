import { requireDashboardAccess } from "@/lib/dashboard/requireDashboardAccess";
import Link from "next/link";
import DashboardShell from "@/components/dashboard/DashboardShell";
import SectionCard from "@/components/dashboard/SectionCard";
import StatusBadge from "@/components/dashboard/StatusBadge";

export default async function CustomerPaymentsPage() {
    const { profile, supabase, unreadCount, customer } = await requireDashboardAccess("customer");

    let billingProfileId = profile.id;
    let isTenant = false;

    if (customer?.unit_id) {
        const { data: unit } = await supabase
            .from("units")
            .select("estate_profile_id")
            .eq("id", customer.unit_id)
            .single();

        if (unit) {
            billingProfileId = unit.estate_profile_id;
            isTenant = true;
        }
    }

    const { data: invoicesData } = await supabase
        .from("payments")
        .select("*")
        .eq("customer_id", billingProfileId)
        .order("created_at", { ascending: false });

    const invoices = invoicesData ?? [];

    return (
        <DashboardShell
            role="customer"
            profileId={profile.id}
            title="Invoices"
            subtitle="Download and review your billing records."
            unreadCount={unreadCount}
        >
            <SectionCard title="Invoices" description="Download and review your billing records">
                {isTenant && (
                    <div className="mb-4 rounded-xl border border-sky-400/20 bg-sky-400/[0.06] px-4 py-3 text-sm text-sky-200">
                        You&apos;re viewing your estate&apos;s shared utility bill.
                    </div>
                )}

                {invoices.length === 0 ? (
                    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/60">
                        No invoices available.
                    </div>
                ) : (
                    <div className="space-y-4">
                        {invoices.map((invoice) => (
                            <div key={invoice.id} className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                                    <div>
                                        <p className="font-bold">
                                            {invoice.invoice_month ?? invoice.date ?? "Invoice"}
                                        </p>
                                        <p className="text-sm text-white/60">
                                            Amount: ₦{Number(invoice.amount ?? 0).toLocaleString()}
                                        </p>
                                        <p className="text-sm text-white/60">
                                            Account: {customer?.account_code ?? "Not available"}
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-3">
                                        <StatusBadge status={invoice.status ?? "pending"} />
                                        <Link
                                            href={`/customer/invoices/${invoice.id}`}
                                            className="rounded-2xl bg-amber-400 px-4 py-2 font-semibold text-black transition hover:bg-amber-300"
                                        >
                                            View / Download
                                        </Link>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </SectionCard>
        </DashboardShell>
    );
}
