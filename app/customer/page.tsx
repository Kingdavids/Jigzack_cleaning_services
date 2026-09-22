import { requireDashboardAccess } from "@/lib/dashboard/requireDashboardAccess";
import DashboardShell from "@/components/dashboard/DashboardShell";
import StatCard from "@/components/dashboard/StatCard";
import { CalendarClock, CalendarCheck, Camera, Wallet } from "lucide-react";

function formatDate(value: string | null | undefined) {
    if (!value) return "Not available";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString("en-CA", {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}

export default async function CustomerPage() {
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

    const [{ data: pickupsData }, { count: uploadsCount }, { data: invoicesData }] = await Promise.all([
        supabase
            .from("tasks")
            .select("scheduled_date")
            .eq("customer_id", profile.id)
            .order("scheduled_date", { ascending: true }),
        supabase
            .from("uploads")
            .select("id", { count: "exact", head: true })
            .eq("customer_id", profile.id),
        supabase.from("payments").select("amount, status").eq("customer_id", billingProfileId),
    ]);

    const pickups = pickupsData ?? [];
    const invoices = invoicesData ?? [];

    const now = new Date();

    const nextPickup =
        pickups.find((pickup) => {
            if (!pickup.scheduled_date) return false;
            return new Date(pickup.scheduled_date) >= now;
        }) ?? null;

    const outstandingBalance = invoices
        .filter((invoice) => (invoice.status ?? "").toLowerCase() !== "paid")
        .reduce((sum, invoice) => sum + Number(invoice.amount ?? 0), 0);

    return (
        <DashboardShell
            role="customer"
            profileId={profile.id}
            title="Customer Dashboard"
            subtitle={`Welcome back, ${profile.full_name ?? customer?.full_name ?? "there"} — track service history, upcoming pickups, photos, and invoices.`}
            unreadCount={unreadCount}
        >
            {isTenant && (
                <div className="mb-5 rounded-xl border border-sky-400/20 bg-sky-400/[0.06] px-4 py-3 text-sm text-sky-200">
                    You&apos;re set up as a tenant. Use Messages to raise a complaint, and Payments to view or download your estate&apos;s shared utility bill.
                </div>
            )}

            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                <StatCard
                    icon={CalendarCheck}
                    label="Last Serviced"
                    value={customer?.last_serviced ? formatDate(customer.last_serviced) : "Not available"}
                    helper="Most recent completed pickup"
                />
                <StatCard
                    icon={CalendarClock}
                    label="Next Pickup"
                    value={nextPickup?.scheduled_date ? formatDate(nextPickup.scheduled_date) : "Not scheduled"}
                    helper="Nearest upcoming service date"
                />
                <StatCard
                    icon={Camera}
                    label="Photos"
                    value={String(uploadsCount ?? 0)}
                    helper="Before and after service uploads"
                />
                <StatCard
                    icon={Wallet}
                    label="Outstanding Balance"
                    value={`₦${outstandingBalance.toLocaleString()}`}
                    helper="Current unpaid invoices"
                />
            </div>
        </DashboardShell>
    );
}
